import React, { useState, useEffect, useRef } from 'react';
import { AnalyzedFile, AnalysisStatus, DocumentType } from './types';
import { analyzeDocument } from './services/geminiService';
import { unlockPdf } from './services/pdfService';
import { FileUpload } from './components/FileUpload';
import { FileCard } from './components/FileCard';
import { SplitterFeature } from './components/SplitterFeature';
import { BarcodeScannerFeature } from './components/BarcodeScannerFeature';
import { Bot, Download, Trash2, FileOutput, Layers, FileSignature, ScanBarcode, Info, Play, PauseCircle, Lock, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

// Gerador de ID seguro para evitar crashes em ambientes sem crypto.randomUUID
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

type Tab = 'renamer' | 'splitter' | 'barcode';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('renamer');

  // --- Renamer State & Logic ---
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [unlockNotification, setUnlockNotification] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>('comprovante');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Ref para cancelar o processamento em andamento
  const abortProcessingRef = useRef(false);

  // Timer para esconder a notificação de desbloqueio automaticamente
  useEffect(() => {
    if (unlockNotification) {
      const timer = setTimeout(() => setUnlockNotification(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [unlockNotification]);

  const handleTypeChange = (newType: DocumentType) => {
    setSelectedType(newType);
    setFiles(prev => prev.map(f => ({
      ...f,
      docType: newType
    })));
  };

  const handleFilesSelected = async (selectedFiles: File[]) => {
    setUnlockNotification(false);

    const newFiles: AnalyzedFile[] = selectedFiles.map(file => ({
      id: generateId(),
      file,
      originalName: file.name,
      docType: selectedType,
      status: AnalysisStatus.IDLE,
      data: null
    }));

    setFiles(prev => [...prev, ...newFiles]);
    processQueue([...files, ...newFiles]);
  };

  const processQueue = async (currentFiles: AnalyzedFile[]) => {
    // Reset o sinal de abortar ao iniciar novo processamento
    abortProcessingRef.current = false;

    const filesToProcess = currentFiles.filter(f => f.status === AnalysisStatus.IDLE);
    if (filesToProcess.length === 0) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    setUnlockNotification(false);
    let abortQueue = false;

    // Processamento SEQUENCIAL
    for (const [index, fileItem] of filesToProcess.entries()) {
      // 1. Check Abort Signal
      if (abortQueue || abortProcessingRef.current) return;

      // Update status to PROCESSING
      setFiles(prev => {
        if (abortProcessingRef.current) return prev; // Safety check inside setter
        return prev.map(f => f.id === fileItem.id ? { ...f, status: AnalysisStatus.PROCESSING } : f);
      });

      try {
        // Delay logic
        if (index > 0) {
          if (abortProcessingRef.current) return;
          await new Promise(resolve => setTimeout(resolve, 5000));
          if (abortProcessingRef.current) return;
        }

        const data = await analyzeDocument(fileItem.file, fileItem.docType);
        
        if (abortProcessingRef.current) return;

        // Update status to COMPLETE
        setFiles(prev => {
          if (abortProcessingRef.current) return prev;
          return prev.map(f => f.id === fileItem.id ? { ...f, status: AnalysisStatus.COMPLETE, data } : f);
        });

      } catch (error: any) {
        if (abortProcessingRef.current) return;

        let status = AnalysisStatus.ERROR;
        let errorMessage = error.message || "Falha na análise";
        let isQuotaError = false;

        if (error.message === "PASSWORD_REQUIRED") {
           status = AnalysisStatus.WAITING_PASSWORD;
           errorMessage = ""; 
        } else if (
            errorMessage.toLowerCase().includes("quota") || 
            errorMessage.includes("429") || 
            errorMessage.toLowerCase().includes("exceeded")
        ) {
           isQuotaError = true;
           errorMessage = "Pausado: Limite da API atingido.";
           abortQueue = true; 
        }

        setFiles(prev => {
          if (abortProcessingRef.current) return prev;
          return prev.map(f => 
            f.id === fileItem.id ? { 
              ...f, 
              status: isQuotaError ? AnalysisStatus.IDLE : status, 
              errorMessage: status === AnalysisStatus.ERROR ? errorMessage : undefined 
            } : f
          );
        });

        // COOLDOWN LOGIC
        if (isQuotaError) {
           setIsProcessing(false); 
           setIsCooldown(true);
           
           setTimeout(() => {
             // Only unlock if user hasn't aborted/cleared in the meantime
             if (!abortProcessingRef.current) {
                 setIsCooldown(false);
                 setUnlockNotification(true); 
             }
           }, 15000);
           
           return;
        }
      }
    }

    if (!abortProcessingRef.current) {
        setIsProcessing(false);
        if (!abortQueue) {
            setUnlockNotification(true);
        }
    }
  };

  const handleRetryProcessing = () => {
      setUnlockNotification(false);
      processQueue(files);
  }

  const handleUnlock = async (id: string, password: string) => {
    const fileItem = files.find(f => f.id === id);
    if (!fileItem) return;

    try {
      const unlockedFile = await unlockPdf(fileItem.file, password);
      setFiles(prev => prev.map(f => {
         if (f.id === id) {
           return {
             ...f,
             file: unlockedFile,
             status: AnalysisStatus.IDLE, 
             errorMessage: undefined
           };
         }
         return f;
      }));
      
      // Small delay to allow state update before processing
      setTimeout(() => {
        setFiles(currentFiles => {
           processQueue(currentFiles);
           return currentFiles;
        });
      }, 100);
    } catch (error) {
      setFiles(prev => prev.map(f => {
        if (f.id === id) {
          return { ...f, errorMessage: "Senha incorreta. Tente novamente." };
        }
        return f;
      }));
    }
  };

  const handleUpdate = (id: string, updates: Partial<AnalyzedFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleDelete = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const generateNewFilename = (item: AnalyzedFile) => {
    if (!item.data) return item.originalName;
    const { date, beneficiary, value } = item.data;
    const safeBeneficiary = beneficiary.replace(/[\\/:*?"<>|]/g, '').trim().toUpperCase();
    const safeValue = value.replace(/\./g, ''); 
    let typeLabel = item.docType.toUpperCase();
    if (item.docType === 'nota_fiscal') typeLabel = 'NOTA FISCAL';
    const ext = item.originalName.split('.').pop();
    return `${date}_${safeBeneficiary}_${safeValue}_${typeLabel}.${ext}`;
  };

  const handleDownload = (item: AnalyzedFile) => {
    if (!item.data) return;
    const newName = generateNewFilename(item);
    const url = URL.createObjectURL(item.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = newName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    const readyFiles = files.filter(f => f.status === AnalysisStatus.COMPLETE);
    readyFiles.forEach(f => handleDownload(f));
  };

  const handleClearAll = () => {
    if (files.length > 0) {
      setShowDeleteConfirm(true);
    }
  };

  const executeClearAll = () => {
    // 1. Stop background processing immediately
    abortProcessingRef.current = true;
    
    // 2. Clear data state
    setFiles([]);
    
    // 3. Reset UI states
    setIsProcessing(false);
    setIsCooldown(false);
    setUnlockNotification(true);
    setShowDeleteConfirm(false);
  };

  const handlePreview = (item: AnalyzedFile) => {
    const fileUrl = URL.createObjectURL(item.file);
    window.open(fileUrl, '_blank');
  };

  const completedCount = files.filter(f => f.status === AnalysisStatus.COMPLETE).length;
  const idleCount = files.filter(f => f.status === AnalysisStatus.IDLE).length;
  const totalCount = files.length;
  const hasErrors = files.some(f => f.status === AnalysisStatus.ERROR && f.errorMessage?.includes("Limite"));
  
  const isLocked = isProcessing || isCooldown;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">Recursos Suop</h1>
                <p className="text-xs text-slate-400">Ferramentas de Automação Financeira</p>
              </div>
            </div>
            
            {activeTab === 'renamer' && totalCount > 0 && (
              <div className="text-sm text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">
                Processados <strong className="text-white">{completedCount}</strong> / {totalCount}
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 border-b border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('renamer')}
              className={`
                flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap
                ${activeTab === 'renamer' 
                  ? 'border-blue-500 text-blue-400 bg-slate-800/30' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}
              `}
            >
              <FileSignature className="w-4 h-4" />
              <span>Renomeador IA</span>
            </button>
            <button
              onClick={() => setActiveTab('splitter')}
              className={`
                flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap
                ${activeTab === 'splitter' 
                  ? 'border-orange-500 text-orange-400 bg-slate-800/30' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}
              `}
            >
              <Layers className="w-4 h-4" />
              <span>Separador</span>
            </button>
            <button
              onClick={() => setActiveTab('barcode')}
              className={`
                flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap
                ${activeTab === 'barcode' 
                  ? 'border-emerald-500 text-emerald-400 bg-slate-800/30' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}
              `}
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Leitor em Lote</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 relative">
        
        {/* Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl transform transition-all scale-100 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-white mb-2 flex items-center">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
                  Limpar Lista?
                </h3>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                  Isso removerá todos os arquivos da lista e interromperá qualquer processamento pendente. Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end space-x-3">
                  <button 
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={executeClearAll}
                    className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-lg shadow-red-900/20 transition-colors flex items-center"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Sim, Limpar Tudo
                  </button>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'renamer' && (
          <div className="animate-in fade-in duration-300">
            
            {/* Notifications Area */}
            <div className="space-y-4 mb-6">
                
                {/* 1. Mensagem de Desbloqueio (Sucesso) */}
                {unlockNotification && (
                    <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 flex items-center animate-in slide-in-from-top-2">
                        <CheckCircle className="w-5 h-5 text-emerald-400 mr-3" />
                        <div>
                            <h3 className="text-sm font-bold text-emerald-200">Importação Liberada!</h3>
                            <p className="text-xs text-emerald-400/80">O sistema está pronto para receber novos arquivos.</p>
                        </div>
                    </div>
                )}

                {/* 2. Mensagem de Erro / Cooldown (Prioridade Alta) */}
                {isCooldown && (
                    <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 flex items-center animate-pulse">
                        <Lock className="w-5 h-5 text-orange-400 mr-3" />
                        <div>
                            <h3 className="text-sm font-bold text-orange-200">Importação Bloqueada Temporariamente</h3>
                            <p className="text-xs text-orange-400/80">Aguardando liberação da API (Cooldown de 15s) para evitar erros.</p>
                        </div>
                    </div>
                )}

                {/* 3. Mensagem de Processamento (Bloqueado) */}
                {isProcessing && !isCooldown && (
                    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 flex items-start gap-3 shadow-sm animate-in fade-in">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-blue-200 mb-1">Processamento em Andamento</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">
                                Para evitar erros de "Cota Excedida", a importação de novos arquivos está <strong>bloqueada</strong> enquanto a fila atual é processada.
                            </p>
                        </div>
                    </div>
                )}

                {/* 4. Info Padrão (Idle) */}
                {!isLocked && !unlockNotification && !hasErrors && (
                    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 flex items-start gap-3 shadow-sm">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                            <Info className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-blue-200 mb-1">Dica de Uso</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">
                                A IA gratuita possui limites de velocidade. Recomendamos enviar lotes de <strong>5 a 10 arquivos</strong> por vez.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Upload Section */}
            <div className="mb-10">
              <FileUpload 
                onFilesSelected={handleFilesSelected} 
                disabled={isLocked}
                selectedType={selectedType}
                onTypeChange={handleTypeChange}
              />
            </div>

            {/* Action Bar */}
            {files.length > 0 && (
              <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-slate-200 flex items-center">
                    <FileOutput className="w-5 h-5 mr-2 text-indigo-400" />
                    Resultados
                    </h2>
                    
                    {/* Status Indicators */}
                    {isProcessing ? (
                        <span className="flex items-center text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded border border-blue-400/20">
                            <Play className="w-3 h-3 mr-1 animate-pulse" />
                            Processando... (Bloqueado)
                        </span>
                    ) : isCooldown ? (
                        <span className="flex items-center text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded border border-orange-400/20">
                            <Lock className="w-3 h-3 mr-1" />
                            Resfriando API...
                        </span>
                    ) : idleCount > 0 ? (
                        <span className="flex items-center text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded border border-yellow-400/20 cursor-pointer hover:bg-yellow-400/20 transition-colors" onClick={handleRetryProcessing}>
                             <PauseCircle className="w-3 h-3 mr-1" />
                            {idleCount} pausados (Clique para retomar)
                        </span>
                    ) : null}
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleClearAll}
                    className="flex items-center px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar
                  </button>
                  <button
                    onClick={handleDownloadAll}
                    disabled={completedCount === 0}
                    className={`
                      flex items-center px-4 py-2 rounded-lg text-sm font-bold shadow-lg 
                      transition-all transform hover:scale-105
                      ${completedCount > 0 
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' 
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
                    `}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Baixar Todos ({completedCount})
                  </button>
                </div>
              </div>
            )}

            {/* List Section */}
            {files.length === 0 ? (
              <div className="text-center py-20 opacity-30">
                <div className="mx-auto w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <FileSignature className="w-10 h-10 text-slate-400" />
                </div>
                <p className="text-xl font-medium">Nenhum arquivo enviado.</p>
                <p className="text-sm mt-2">Selecione "Comprovante", "Boleto" ou "Nota Fiscal" acima.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {files.map(file => (
                  <FileCard 
                    key={file.id} 
                    item={file} 
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    onPreview={handlePreview}
                    onUnlock={handleUnlock}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'splitter' && <SplitterFeature />}
        {activeTab === 'barcode' && <BarcodeScannerFeature />}

      </main>

      <footer className="py-6 border-t border-slate-800 text-center text-slate-500 text-sm">
        <p>Recursos Suop &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
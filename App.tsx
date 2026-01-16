import React, { useState, useEffect, useRef } from 'react';
import { AnalyzedFile, AnalysisStatus, DocumentType } from './types';
import { analyzeDocument } from './services/geminiService';
import { unlockPdf } from './services/pdfService';
import { FileUpload } from './components/FileUpload';
import { FileCard } from './components/FileCard';
import { SplitterFeature } from './components/SplitterFeature';
import { BarcodeScannerFeature } from './components/BarcodeScannerFeature';
import { Bot, Download, Trash2, FileOutput, Layers, FileSignature, ScanBarcode, Loader2, AlertTriangle } from 'lucide-react';

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

type Tab = 'renamer' | 'splitter' | 'barcode';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('renamer');
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCooldown, setIsCooldown] = useState(false);
  const [unlockNotification, setUnlockNotification] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>('comprovante');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const abortProcessingRef = useRef(false);

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
    abortProcessingRef.current = false;
    const filesToProcess = currentFiles.filter(f => f.status === AnalysisStatus.IDLE);
    if (filesToProcess.length === 0) {
      setIsProcessing(false);
      return;
    }
    setIsProcessing(true);
    setUnlockNotification(false);
    let abortQueue = false;

    for (const [index, fileItem] of filesToProcess.entries()) {
      if (abortQueue || abortProcessingRef.current) break;
      
      setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: AnalysisStatus.PROCESSING } : f));
      
      try {
        // Delay para evitar rate limit excessivo (429)
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        const data = await analyzeDocument(fileItem.file, fileItem.docType);
        if (abortProcessingRef.current) return;
        
        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: AnalysisStatus.COMPLETE, data } : f));
      } catch (error: any) {
        if (abortProcessingRef.current) return;
        let status = AnalysisStatus.ERROR;
        let errorMessage = error.message || "Falha na análise";
        let isQuotaError = false;

        if (error.message === "PASSWORD_REQUIRED") {
           status = AnalysisStatus.WAITING_PASSWORD;
           errorMessage = ""; 
        } else if (errorMessage.toLowerCase().includes("quota") || errorMessage.includes("429")) {
           isQuotaError = true;
           errorMessage = "Pausado: Limite da API atingido.";
           abortQueue = true; 
        }

        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: isQuotaError ? AnalysisStatus.IDLE : status, errorMessage } : f));
        
        if (isQuotaError) {
           setIsProcessing(false); 
           setIsCooldown(true);
           setTimeout(() => { setIsCooldown(false); setUnlockNotification(true); }, 15000);
           return;
        }
      }
    }
    setIsProcessing(false);
  };

  const handleDownload = (item: AnalyzedFile) => {
    if (!item.data) return;
    const { date, beneficiary, value, docNumber } = item.data;
    const safeBeneficiary = beneficiary.replace(/[\\/:*?"<>|]/g, '').trim().toUpperCase();
    const safeValue = value.replace(/\./g, '');
    const safeDocNumber = docNumber ? docNumber.replace(/[\\/:*?"<>|]/g, '').trim().toUpperCase() : '';
    
    let typeLabel = item.docType.toUpperCase();
    if (item.docType === 'nota_fiscal') typeLabel = 'NOTA FISCAL';
    const ext = item.originalName.split('.').pop();
    
    const nameParts = [date, safeBeneficiary];
    if (safeDocNumber) nameParts.push(safeDocNumber);
    nameParts.push(safeValue);
    nameParts.push(typeLabel);

    const newName = `${nameParts.join('_')}.${ext}`;
    
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
    files.filter(f => f.status === AnalysisStatus.COMPLETE).forEach(f => handleDownload(f));
  };

  const handleClearAll = () => { if (files.length > 0) setShowDeleteConfirm(true); };
  const executeClearAll = () => { abortProcessingRef.current = true; setFiles([]); setIsProcessing(false); setShowDeleteConfirm(false); };
  const handlePreview = (item: AnalyzedFile) => window.open(URL.createObjectURL(item.file), '_blank');
  const handleUpdate = (id: string, updates: Partial<AnalyzedFile>) => setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  const handleDelete = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));
  const handleUnlock = async (id: string, password: string) => {
    const fileItem = files.find(f => f.id === id);
    if (!fileItem) return;
    try {
      const unlockedFile = await unlockPdf(fileItem.file, password);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, file: unlockedFile, status: AnalysisStatus.IDLE } : f));
      setTimeout(() => processQueue(files), 100);
    } catch (e) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, errorMessage: "Senha incorreta." } : f));
    }
  };

  const completedCount = files.filter(f => f.status === AnalysisStatus.COMPLETE).length;
  const totalCount = files.length;
  const isLocked = isProcessing || isCooldown;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
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
                Lote Atual: <strong className="text-white">{completedCount}</strong> / {totalCount}
              </div>
            )}
          </div>
          <div className="flex space-x-1 border-b border-slate-800 overflow-x-auto">
            <button onClick={() => setActiveTab('renamer')} className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'renamer' ? 'border-blue-500 text-blue-400 bg-slate-800/30' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}>
              <FileSignature className="w-4 h-4" /> <span>Renomeador IA</span>
            </button>
            <button onClick={() => setActiveTab('splitter')} className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'splitter' ? 'border-orange-500 text-orange-400 bg-slate-800/30' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}>
              <Layers className="w-4 h-4" /> <span>Separador</span>
            </button>
            <button onClick={() => setActiveTab('barcode')} className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === 'barcode' ? 'border-emerald-500 text-emerald-400 bg-slate-800/30' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}>
              <ScanBarcode className="w-4 h-4" /> <span>Leitor em Lote</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 relative">
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-lg font-bold text-white mb-2 flex items-center">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" /> Limpar Lista?
                </h3>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                  Isso removerá todos os arquivos da lista e interromperá qualquer processamento pendente.
                </p>
                <div className="flex justify-end space-x-3">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg">Cancelar</button>
                  <button onClick={executeClearAll} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-lg shadow-red-900/20 transition-colors flex items-center">
                    <Trash2 className="w-4 h-4 mr-2" /> Sim, Limpar Tudo
                  </button>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'renamer' && (
          <div className="animate-in fade-in duration-300">
            {isProcessing && !isCooldown && (
                <div className="mb-6 bg-slate-800/60 border border-slate-700 rounded-lg p-4 flex items-start gap-3 shadow-sm">
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-blue-200 mb-1">Processando Lote</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">Importação bloqueada temporariamente para garantir a ordem da fila.</p>
                    </div>
                </div>
            )}

            <div className="mb-10">
              <FileUpload onFilesSelected={handleFilesSelected} disabled={isLocked} selectedType={selectedType} onTypeChange={handleTypeChange} />
            </div>

            {files.length > 0 && (
              <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-slate-200 flex items-center">
                    <FileOutput className="w-5 h-5 mr-2 text-indigo-400" /> Arquivos no Lote
                    </h2>
                </div>
                <div className="flex items-center space-x-3">
                  <button onClick={handleClearAll} className="flex items-center px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors">
                    <Trash2 className="w-4 h-4 mr-2" /> Limpar
                  </button>
                  <button onClick={handleDownloadAll} disabled={completedCount === 0} className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-colors ${completedCount > 0 ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                    <Download className="w-4 h-4 mr-2" /> Baixar Todos ({completedCount})
                  </button>
                </div>
              </div>
            )}

            {files.length === 0 ? (
              <div className="text-center py-20 opacity-30">
                <div className="mx-auto w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <FileSignature className="w-10 h-10 text-slate-400" />
                </div>
                <p className="text-xl font-medium">Nenhum arquivo no lote.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {files.map(file => (
                  <FileCard key={file.id} item={file} onUpdate={handleUpdate} onDelete={handleDelete} onDownload={handleDownload} onPreview={handlePreview} onUnlock={handleUnlock} />
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
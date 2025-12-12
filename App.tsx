import React, { useState } from 'react';
import { AnalyzedFile, AnalysisStatus, DocumentType } from './types';
import { analyzeDocument } from './services/geminiService';
import { unlockPdf } from './services/pdfService';
import { FileUpload } from './components/FileUpload';
import { FileCard } from './components/FileCard';
import { SplitterFeature } from './components/SplitterFeature';
import { BarcodeScannerFeature } from './components/BarcodeScannerFeature';
import { Bot, Download, Trash2, FileOutput, Layers, FileSignature, ScanBarcode } from 'lucide-react';

const generateId = () => crypto.randomUUID();

type Tab = 'renamer' | 'splitter' | 'barcode';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('renamer');

  // --- Renamer State & Logic ---
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>('comprovante');

  const handleTypeChange = (newType: DocumentType) => {
    setSelectedType(newType);
    setFiles(prev => prev.map(f => ({
      ...f,
      docType: newType
    })));
  };

  const handleFilesSelected = async (selectedFiles: File[]) => {
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
    const filesToProcess = currentFiles.filter(f => f.status === AnalysisStatus.IDLE);
    if (filesToProcess.length === 0) return;

    setIsProcessing(true);

    setFiles(prev => prev.map(f => 
      filesToProcess.find(ftp => ftp.id === f.id) 
        ? { ...f, status: AnalysisStatus.PROCESSING } 
        : f
    ));

    const updates = await Promise.all(filesToProcess.map(async (fileItem) => {
      try {
        const data = await analyzeDocument(fileItem.file, fileItem.docType);
        return {
          id: fileItem.id,
          status: AnalysisStatus.COMPLETE,
          data
        };
      } catch (error: any) {
        // Verifica se é erro de senha
        if (error.message === "PASSWORD_REQUIRED") {
           return {
             id: fileItem.id,
             status: AnalysisStatus.WAITING_PASSWORD
           };
        }

        return {
          id: fileItem.id,
          status: AnalysisStatus.ERROR,
          errorMessage: error.message || "Falha na análise"
        };
      }
    }));

    setFiles(prev => prev.map(f => {
      const update = updates.find(u => u.id === f.id);
      return update ? { ...f, ...update } : f;
    }));

    setIsProcessing(false);
  };

  const handleUnlock = async (id: string, password: string) => {
    // Encontrar o arquivo
    const fileItem = files.find(f => f.id === id);
    if (!fileItem) return;

    try {
      const unlockedFile = await unlockPdf(fileItem.file, password);
      
      // Atualizar o estado com o arquivo desbloqueado e reiniciar status para processamento
      setFiles(prev => prev.map(f => {
         if (f.id === id) {
           return {
             ...f,
             file: unlockedFile,
             status: AnalysisStatus.IDLE, // Volta para IDLE para ser pego pelo processQueue
             errorMessage: undefined // Limpa erros anteriores
           };
         }
         return f;
      }));

      // Disparar processamento novamente (com um pequeno delay para garantir atualização de estado)
      setTimeout(() => {
        setFiles(currentFiles => {
           processQueue(currentFiles);
           return currentFiles;
        });
      }, 100);

    } catch (error) {
      // Definir mensagem de erro no item do arquivo
      setFiles(prev => prev.map(f => {
        if (f.id === id) {
          return {
            ...f,
            errorMessage: "Senha incorreta. Tente novamente."
          };
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
    if (confirm("Tem certeza que deseja remover todos os arquivos?")) {
      setFiles([]);
    }
  };

  const handlePreview = (item: AnalyzedFile) => {
    const fileUrl = URL.createObjectURL(item.file);
    window.open(fileUrl, '_blank');
  };

  const completedCount = files.filter(f => f.status === AnalysisStatus.COMPLETE).length;
  const totalCount = files.length;

  // --- End Renamer Logic ---

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
            {/* 
            <button
              onClick={() => setActiveTab('cutter')}
              className={`
                flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap
                ${activeTab === 'cutter' 
                  ? 'border-indigo-500 text-indigo-400 bg-slate-800/30' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}
              `}
            >
              <Scissors className="w-4 h-4" />
              <span>Recortar PDF</span>
            </button> 
            */}
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
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        
        {/* VIEW: Renamer */}
        {activeTab === 'renamer' && (
          <div className="animate-in fade-in duration-300">
            {/* Upload Section */}
            <div className="mb-10">
              <FileUpload 
                onFilesSelected={handleFilesSelected} 
                disabled={isProcessing}
                selectedType={selectedType}
                onTypeChange={handleTypeChange}
              />
            </div>

            {/* Action Bar */}
            {files.length > 0 && (
              <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                <h2 className="text-lg font-semibold text-slate-200 flex items-center">
                  <FileOutput className="w-5 h-5 mr-2 text-indigo-400" />
                  Resultados
                </h2>
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

        {/* VIEW: Splitter */}
        {activeTab === 'splitter' && (
          <SplitterFeature />
        )}

        {/* VIEW: Cutter (Disabled) */}
        {/* {activeTab === 'cutter' && (
          <PdfCutterFeature />
        )} */}

        {/* VIEW: Barcode Scanner */}
        {activeTab === 'barcode' && (
          <BarcodeScannerFeature />
        )}

      </main>

      <footer className="py-6 border-t border-slate-800 text-center text-slate-500 text-sm">
        <p>Recursos Suop &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { FileType, Scissors, Download, Trash2, Layers, Loader2, Eye, Copy } from 'lucide-react';
import { splitPdfByPage } from '../services/pdfService';
import { analyzeDocument } from '../services/geminiService';

interface SplitFileItem {
  id: string;
  file: File;
  originalName: string;
  finalName: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  pageIndex: number;
}

export const SplitterFeature: React.FC = () => {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [splitItems, setSplitItems] = useState<SplitFileItem[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setError('Por favor, selecione apenas arquivos PDF.');
        return;
      }
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isSplitting) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type !== 'application/pdf') {
        setError('Por favor, selecione apenas arquivos PDF.');
        return;
      }
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setOriginalFile(file);
    setSplitItems([]);
    setError(null);
    setIsSplitting(true);

    try {
      // 1. Split Pages
      const files = await splitPdfByPage(file);
      
      // 2. Prepare Items
      const items: SplitFileItem[] = files.map((f, index) => ({
        id: crypto.randomUUID(),
        file: f,
        originalName: f.name,
        finalName: f.name, // Default name before AI
        status: 'pending',
        pageIndex: index + 1
      }));

      setSplitItems(items);
      setIsSplitting(false);

      // 3. Trigger Analysis for Renaming (Background)
      analyzeSplitFiles(items);

    } catch (err: any) {
      setError(err.message || 'Erro ao processar o PDF.');
      setIsSplitting(false);
    }
  };

  const analyzeSplitFiles = async (items: SplitFileItem[]) => {
    // Set all to analyzing
    setSplitItems(prev => prev.map(item => ({ ...item, status: 'analyzing' })));

    // Process individually to allow progress updates
    const updatedItems = [...items];

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      try {
        // Use existing Gemini service to find Due Date
        const data = await analyzeDocument(item.file, 'boleto');
        
        // Rename logic: YYYYMMDD_Boleto_PgX.pdf
        // If no date found, fallback to original logic
        const datePart = data.date && data.date.length === 8 ? data.date : 'SEM_DATA';
        const newName = `${datePart}_Boleto_Pag${item.pageIndex}.pdf`;

        // Update state for this item
        setSplitItems(prev => prev.map(p => 
          p.id === item.id ? { ...p, status: 'done', finalName: newName } : p
        ));
      } catch (e) {
        console.error("Error analyzing split page", e);
        setSplitItems(prev => prev.map(p => 
          p.id === item.id ? { ...p, status: 'error' } : p
        ));
      }
    }
  };

  const handleDownload = (item: SplitFileItem) => {
    const url = URL.createObjectURL(item.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreview = (item: SplitFileItem) => {
    const url = URL.createObjectURL(item.file);
    window.open(url, '_blank');
  };

  const handleDownloadAll = () => {
    // Downloads files individually, staggered to prevent browser blocking.
    // DOES NOT ZIP.
    splitItems.forEach((item, index) => {
      setTimeout(() => {
        handleDownload(item);
      }, index * 600); // 600ms delay between downloads
    });
  };

  const handleReset = () => {
    setOriginalFile(null);
    setSplitItems([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processingCount = splitItems.filter(i => i.status === 'analyzing').length;
  const doneCount = splitItems.filter(i => i.status === 'done').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-2 flex items-center">
          <Scissors className="w-5 h-5 mr-2 text-orange-400" />
          Separador de Boletos Inteligente
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Separa páginas de PDF e renomeia automaticamente usando a Data de Vencimento do boleto.
        </p>

        {!originalFile && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-600 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-orange-500/50 transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="application/pdf"
              className="hidden"
            />
            <div className="bg-slate-700 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
              <Layers className="w-8 h-8 text-orange-400" />
            </div>
            <p className="text-slate-300 font-medium">Clique ou arraste seu PDF Multipáginas aqui</p>
            <p className="text-xs text-slate-500 mt-2">Apenas arquivos PDF</p>
          </div>
        )}

        {isSplitting && (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-orange-400 mb-3" />
            <p>Separando páginas...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 text-red-200 p-4 rounded-lg mt-4 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={handleReset} className="text-sm underline hover:text-white">Tentar Novamente</button>
          </div>
        )}

        {!isSplitting && originalFile && splitItems.length > 0 && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
              <div className="flex items-center space-x-2">
                <FileType className="w-5 h-5 text-slate-500" />
                <span className="text-white font-medium">{originalFile.name}</span>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                  {splitItems.length} páginas
                </span>
                {processingCount > 0 && (
                   <span className="text-xs text-orange-400 flex items-center">
                     <Loader2 className="w-3 h-3 animate-spin mr-1" />
                     Lendo datas... ({doneCount}/{splitItems.length})
                   </span>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleReset}
                  className="flex items-center text-sm text-slate-400 hover:text-red-400 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-slate-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar
                </button>
                <button
                  onClick={handleDownloadAll}
                  disabled={processingCount > 0}
                  className={`
                    flex items-center text-sm px-4 py-2 rounded-lg font-bold transition-all
                    ${processingCount > 0 
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                      : 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/20'}
                  `}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {splitItems.map((item) => (
                <div key={item.id} className="bg-slate-900 border border-slate-700 p-4 rounded-lg hover:border-orange-500/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="bg-orange-500/10 p-2 rounded text-orange-400">
                      <FileType className="w-6 h-6" />
                    </div>
                    <div className="flex space-x-1">
                      <button 
                        onClick={() => handlePreview(item)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                        title="Visualizar em nova aba"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-mono text-slate-500 py-1.5 px-2 bg-slate-800 rounded">
                        Pag {item.pageIndex}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                     <p className="text-sm text-slate-200 font-medium truncate" title={item.finalName}>
                      {item.finalName}
                    </p>
                    {item.status === 'analyzing' && (
                      <p className="text-xs text-orange-400 mt-1 animate-pulse">Identificando vencimento...</p>
                    )}
                     {item.status === 'error' && (
                      <p className="text-xs text-red-400 mt-1">Falha na leitura</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownload(item)}
                    className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded text-xs font-medium transition-colors border border-slate-700"
                  >
                    <Download className="w-3 h-3" />
                    <span>Baixar PDF</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { ScanBarcode, Copy, Check, AlertCircle, Loader2, UploadCloud, X, QrCode, FileText, Image as ImageIcon, ClipboardPaste } from 'lucide-react';
import { extractBoletoCode } from '../services/geminiService';

interface BarcodeItem {
  id: string;
  file: File;
  barCode: string | null;
  pixCode: string | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  copiedBarCode: boolean;
  copiedPixCode: boolean;
}

export const BarcodeScannerFeature: React.FC = () => {
  const [items, setItems] = useState<BarcodeItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen for paste events (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        e.preventDefault();
        const pastedFiles = Array.from(e.clipboardData.files);
        handleFiles(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  const handleFiles = (files: File[]) => {
    // Permite PDF e Imagens
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    
    const newItems = files
      .filter(f => validTypes.includes(f.type))
      .map(file => ({
        id: crypto.randomUUID(),
        file,
        barCode: null,
        pixCode: null,
        status: 'pending' as const,
        copiedBarCode: false,
        copiedPixCode: false
      }));

    if (newItems.length === 0 && files.length > 0) {
      alert("Por favor, cole ou selecione apenas arquivos PDF ou Imagens (JPG/PNG).");
      return;
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
      processQueue(newItems);
    }
  };

  const processQueue = async (queueItems: BarcodeItem[]) => {
    for (const item of queueItems) {
      updateItemStatus(item.id, 'processing');
      try {
        const result = await extractBoletoCode(item.file);
        
        if (result.found && (result.barCode || result.pixCode)) {
          setItems(prev => prev.map(i => 
            i.id === item.id ? { 
              ...i, 
              status: 'success', 
              barCode: result.barCode || null,
              pixCode: result.pixCode || null
            } : i
          ));
        } else {
          setItems(prev => prev.map(i => 
            i.id === item.id ? { ...i, status: 'error' } : i
          ));
        }
      } catch (e) {
        setItems(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'error' } : i
        ));
      }
    }
  };

  const updateItemStatus = (id: string, status: BarcodeItem['status']) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  };

  const handleCopy = async (id: string, text: string, type: 'barcode' | 'pix') => {
    try {
      await navigator.clipboard.writeText(text);
      setItems(prev => prev.map(i => {
        if (i.id !== id) return i;
        return type === 'barcode' 
          ? { ...i, copiedBarCode: true }
          : { ...i, copiedPixCode: true };
      }));

      setTimeout(() => {
        setItems(prev => prev.map(i => {
          if (i.id !== id) return i;
          return type === 'barcode'
            ? { ...i, copiedBarCode: false }
            : { ...i, copiedPixCode: false };
        }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-2 flex items-center">
          <ScanBarcode className="w-5 h-5 mr-2 text-emerald-400" />
          Extrator de Pagamentos (Boleto & Pix)
        </h2>
        
        {/* Upload Area */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-600 rounded-xl p-8 cursor-pointer hover:bg-slate-800 hover:border-emerald-500/50 transition-all group mb-8 relative overflow-hidden"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
            accept="application/pdf,image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
          />
          
          <div className="flex flex-col items-center justify-center relative z-10">
            <div className="bg-slate-700 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform shadow-lg relative">
              <UploadCloud className="w-8 h-8 text-emerald-400" />
              <div className="absolute -right-2 -bottom-2 bg-slate-900 rounded-full p-1 border border-slate-600">
                <ClipboardPaste className="w-4 h-4 text-emerald-300" />
              </div>
            </div>
            <p className="text-slate-200 font-bold text-lg mb-1">Arraste arquivos ou <span className="text-emerald-400">Cole (Ctrl+V)</span></p>
            <p className="text-slate-500 text-sm mb-6">Processamento automático de PDFs e Imagens</p>
            
            {/* Instructional Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              {/* Option 1: PDF */}
              <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700 hover:border-blue-500/50 transition-colors flex items-start space-x-3 text-left">
                <div className="bg-blue-500/20 p-2 rounded shrink-0">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <span className="text-blue-300 font-bold text-sm block mb-1">ARQUIVO PDF</span>
                  <p className="text-xs text-slate-400">
                    Envie o <strong>PDF original</strong>.
                    <br/>
                    O sistema extrai tanto a <strong>Linha Digitável</strong> quanto o <strong>QR Code Pix</strong>.
                  </p>
                </div>
              </div>

              {/* Option 2: Image */}
              <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-700 hover:border-pink-500/50 transition-colors flex items-start space-x-3 text-left">
                <div className="bg-pink-500/20 p-2 rounded shrink-0">
                  <ImageIcon className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <span className="text-pink-300 font-bold text-sm block mb-1">IMAGEM / PRINT</span>
                  <p className="text-xs text-slate-400">
                    Use <strong>Ctrl+V</strong> ou envie imagens.
                    <br/>
                    Alternativa rápida para ler códigos sem precisar baixar o PDF.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="bg-slate-900 border border-slate-700 rounded-lg p-4 relative animate-in slide-in-from-bottom-2">
              
              {/* Delete Button (Absolute) */}
              <button 
                onClick={() => handleDelete(item.id)}
                className="absolute top-4 right-4 p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                title="Remover"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header / Status */}
              <div className="pr-12 mb-4">
                <div className="flex items-center space-x-2 mb-1">
                  {item.file.type === 'application/pdf' ? (
                     <FileText className="w-4 h-4 text-blue-400" />
                  ) : (
                     <ImageIcon className="w-4 h-4 text-pink-400" />
                  )}
                  <span className="text-sm font-medium text-slate-200 truncate">{item.file.name}</span>
                </div>
                
                {item.status === 'processing' && (
                  <div className="flex items-center text-xs text-emerald-400 font-medium animate-pulse ml-6">
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    Analisando códigos...
                  </div>
                )}
                
                {item.status === 'error' && (
                  <div className="flex items-center text-xs text-red-400 ml-6">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Nenhum código identificado. Tente enviar uma imagem mais nítida.
                  </div>
                )}
              </div>

              {/* Results Container */}
              {item.status === 'success' && (
                <div className="space-y-3 ml-6">
                  
                  {/* Result: Barcode */}
                  {item.barCode && (
                    <div className="bg-slate-950/50 p-3 rounded border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                       <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center mb-1">
                            <ScanBarcode className="w-3 h-3 mr-1" /> Linha Digitável (Boleto)
                          </span>
                          <div className="font-mono text-sm text-slate-300 break-all select-all">
                            {item.barCode}
                          </div>
                       </div>
                       <button
                        onClick={() => handleCopy(item.id, item.barCode!, 'barcode')}
                        className={`
                          shrink-0 flex items-center justify-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-all
                          ${item.copiedBarCode 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600'}
                        `}
                      >
                        {item.copiedBarCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{item.copiedBarCode ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  )}

                  {/* Result: Pix */}
                  {item.pixCode && (
                    <div className="bg-slate-950/50 p-3 rounded border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                       <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-pink-500 uppercase font-bold flex items-center mb-1">
                            <QrCode className="w-3 h-3 mr-1" /> Pix Copia e Cola
                          </span>
                          <div className="font-mono text-sm text-slate-300 break-all select-all" title="Código completo para pagamento">
                            {item.pixCode}
                          </div>
                       </div>
                       <button
                        onClick={() => handleCopy(item.id, item.pixCode!, 'pix')}
                        className={`
                          shrink-0 flex items-center justify-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-all
                          ${item.copiedPixCode 
                            ? 'bg-pink-600 text-white' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600'}
                        `}
                      >
                        {item.copiedPixCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{item.copiedPixCode ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  )}

                  {/* Fallback if logic says success but both are null (rare edge case with Gemini) */}
                  {!item.barCode && !item.pixCode && (
                     <div className="text-xs text-yellow-500 flex items-center">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        O documento foi lido, mas nenhum código específico foi encontrado.
                     </div>
                  )}

                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
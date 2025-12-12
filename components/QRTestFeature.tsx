import React, { useState, useRef } from 'react';
import { QrCode, UploadCloud, Loader2, Check, AlertTriangle, ScanLine, FileImage } from 'lucide-react';
import { extractBoletoCode } from '../services/geminiService';
import { convertPdfToImage } from '../services/pdfService';

export const QRTestFeature: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'converting' | 'analyzing' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<{ barCode?: string; pixCode?: string } | null>(null);
  const [conversionNote, setConversionNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.type.startsWith('image/')) {
      alert('Por favor, envie um PDF ou Imagem.');
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setConversionNote(null);
    
    let fileToAnalyze = selectedFile;

    try {
      // Se for PDF, converte para imagem primeiro
      if (selectedFile.type === 'application/pdf') {
        setStatus('converting');
        try {
          fileToAnalyze = await convertPdfToImage(selectedFile);
          setConversionNote("PDF convertido para Imagem de Alta Resolução para forçar leitura visual.");
        } catch (err) {
          console.error("Falha na conversão para imagem, usando PDF original", err);
          setConversionNote("Falha na conversão de imagem. Usando PDF original (pode afetar leitura do QR).");
        }
      }

      setStatus('analyzing');
      const data = await extractBoletoCode(fileToAnalyze);
      
      if (data.found && (data.barCode || data.pixCode)) {
        setResult({ barCode: data.barCode, pixCode: data.pixCode });
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleReset = () => {
    setFile(null);
    setStatus('idle');
    setResult(null);
    setConversionNote(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in zoom-in duration-300">
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center space-x-3 mb-6 border-b border-slate-700 pb-4">
          <div className="bg-purple-500/20 p-2 rounded-lg">
            <ScanLine className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Laboratório de Teste QR (Modo Câmera)</h2>
            <p className="text-sm text-slate-400">
              Este modo <strong className="text-white">converte o PDF em Imagem</strong> antes de analisar, ignorando textos ocultos e forçando a leitura visual do QR Code.
            </p>
          </div>
        </div>

        {/* Upload Area */}
        {status === 'idle' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="border-2 border-dashed border-slate-600 bg-slate-900/50 rounded-xl h-64 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/50 hover:bg-slate-800 transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              accept="application/pdf,image/*"
              className="hidden"
            />
            <div className="bg-slate-800 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform shadow-lg">
              <UploadCloud className="w-10 h-10 text-purple-400" />
            </div>
            <p className="text-lg text-slate-200 font-medium">Arraste o arquivo aqui</p>
            <p className="text-sm text-slate-500 mt-2">PDF ou Imagem do QR Code</p>
          </div>
        )}

        {/* Loading State: Converting */}
        {status === 'converting' && (
          <div className="h-64 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-slate-700/50">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
              <FileImage className="w-12 h-12 text-blue-400 animate-pulse relative z-10" />
            </div>
            <p className="mt-6 text-slate-300 font-medium">Rasterizando PDF...</p>
            <p className="text-xs text-slate-500 mt-2">Convertendo páginas em imagens de alta definição</p>
          </div>
        )}

        {/* Loading State: Analyzing */}
        {status === 'analyzing' && (
          <div className="h-64 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-slate-700/50">
            <div className="relative">
              <div className="absolute inset-0 bg-purple-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin relative z-10" />
            </div>
            <p className="mt-6 text-slate-300 font-medium animate-pulse">Lendo Imagem...</p>
            <p className="text-xs text-slate-500 mt-2">Decodificando QR Code visualmente (Computer Vision)</p>
          </div>
        )}

        {/* Results State */}
        {(status === 'success' || status === 'error') && (
          <div className="space-y-6">
            <div className="flex flex-col space-y-2 bg-slate-900 p-4 rounded-lg border border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400 flex items-center">
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Arquivo: <span className="text-slate-200 ml-1 font-medium">{file?.name}</span>
                </span>
                <button 
                  onClick={handleReset}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Testar outro
                </button>
              </div>
              {conversionNote && (
                <div className="text-[10px] text-blue-400 flex items-center border-t border-slate-800 pt-2">
                  <FileImage className="w-3 h-3 mr-1" />
                  {conversionNote}
                </div>
              )}
            </div>

            {status === 'error' ? (
              <div className="bg-red-900/20 border border-red-500/30 p-6 rounded-xl flex items-start space-x-4">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-red-200 font-bold">Falha na Leitura Visual</h3>
                  <p className="text-red-300/80 text-sm mt-1">
                    Mesmo convertendo para imagem, o sistema não conseguiu identificar um QR Code Pix válido ou Linha Digitável. Verifique se a imagem está nítida.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 animate-in slide-in-from-bottom-4 duration-500">
                {/* Pix Result */}
                <div className={`p-5 rounded-xl border transition-all ${result?.pixCode ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-slate-800 border-slate-700 opacity-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center">
                      <QrCode className="w-4 h-4 mr-2" /> Pix Copia e Cola
                    </span>
                    {result?.pixCode && <Check className="w-4 h-4 text-emerald-500" />}
                  </div>
                  {result?.pixCode ? (
                    <div className="bg-slate-950 p-3 rounded-lg border border-emerald-900/30 group relative">
                      <code className="text-sm text-slate-300 break-all font-mono select-all block">
                        {result.pixCode}
                      </code>
                      <button 
                        onClick={() => navigator.clipboard.writeText(result.pixCode!)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-emerald-600 text-white text-xs px-2 py-1 rounded transition-opacity"
                      >
                        Copiar
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500 italic">Não detectado visualmente</span>
                  )}
                </div>

                {/* Barcode Result */}
                <div className={`p-5 rounded-xl border transition-all ${result?.barCode ? 'bg-blue-900/10 border-blue-500/30' : 'bg-slate-800 border-slate-700 opacity-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center">
                      <ScanLine className="w-4 h-4 mr-2" /> Linha Digitável
                    </span>
                    {result?.barCode && <Check className="w-4 h-4 text-blue-500" />}
                  </div>
                  {result?.barCode ? (
                    <div className="bg-slate-950 p-3 rounded-lg border border-blue-900/30 group relative">
                      <code className="text-sm text-slate-300 break-all font-mono select-all block">
                        {result.barCode}
                      </code>
                      <button 
                         onClick={() => navigator.clipboard.writeText(result.barCode!)}
                         className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-blue-600 text-white text-xs px-2 py-1 rounded transition-opacity"
                      >
                        Copiar
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500 italic">Não detectado</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
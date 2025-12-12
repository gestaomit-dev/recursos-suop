import React, { useState, useRef, useEffect } from 'react';
import { Scissors, Download, UploadCloud, FileText, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { extractPagesFromPdf } from '../services/pdfService';
import { PDFDocument } from 'pdf-lib';

export const PdfCutterFeature: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pageRange, setPageRange] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedFile, setGeneratedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setError('Por favor, selecione apenas arquivos PDF.');
      return;
    }

    setFile(selectedFile);
    setGeneratedFile(null);
    setError(null);
    setPageRange('');
    setIsProcessing(true);

    try {
      // Obter número de páginas
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      setTotalPages(pdfDoc.getPageCount());
    } catch (e) {
      setError("Não foi possível ler o arquivo PDF.");
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const parsePageRange = (input: string): number[] => {
    const pages = new Set<number>();
    const parts = input.split(',').map(p => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n, 10));
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.min(start, end);
          const max = Math.max(start, end);
          for (let i = min; i <= max; i++) pages.add(i);
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num)) pages.add(num);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleProcess = async () => {
    if (!file || !pageRange) return;

    setIsProcessing(true);
    setError(null);

    try {
      const pagesToExtract = parsePageRange(pageRange);
      
      // Validação
      if (pagesToExtract.length === 0) throw new Error("Nenhuma página válida inserida.");
      if (pagesToExtract.some(p => p < 1 || p > totalPages)) {
        throw new Error(`Algumas páginas estão fora do limite (1-${totalPages}).`);
      }

      const newPdf = await extractPagesFromPdf(file, pagesToExtract);
      setGeneratedFile(newPdf);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!generatedFile) return;
    const url = URL.createObjectURL(generatedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setTotalPages(0);
    setPageRange('');
    setGeneratedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
        <h2 className="text-xl font-semibold text-white mb-2 flex items-center">
          <Scissors className="w-5 h-5 mr-2 text-indigo-400" />
          Recortar PDF (Extrair Páginas)
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Crie um novo arquivo PDF contendo apenas as páginas que você escolher.
        </p>

        {!file && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-600 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-indigo-500/50 transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              accept="application/pdf"
              className="hidden"
            />
            <div className="bg-slate-700 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8 text-indigo-400" />
            </div>
            <p className="text-slate-300 font-medium">Clique ou arraste seu PDF aqui</p>
          </div>
        )}

        {file && (
          <div className="space-y-6">
            {/* File Info Card */}
            <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-indigo-500/20 p-2 rounded text-indigo-400">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-xs text-slate-400">{totalPages} páginas encontradas</p>
                </div>
              </div>
              <button onClick={handleReset} className="text-slate-400 hover:text-white p-2">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Input Controls */}
            {!generatedFile && (
              <div className="bg-slate-800/80 p-6 rounded-lg border border-slate-700/50">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Quais páginas deseja salvar?
                </label>
                <div className="flex flex-col md:flex-row gap-3">
                  <input 
                    type="text" 
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    placeholder="Ex: 1, 3, 5-10"
                    className="flex-1 bg-slate-950 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-600"
                    autoFocus
                  />
                  <button 
                    onClick={handleProcess}
                    disabled={!pageRange || isProcessing}
                    className={`
                      px-6 py-2 rounded-lg font-bold flex items-center justify-center
                      ${!pageRange || isProcessing
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20'}
                    `}
                  >
                    {isProcessing ? 'Processando...' : 'Gerar PDF'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Use vírgulas para páginas individuais (ex: 1, 5) e hífen para intervalos (ex: 10-15).
                </p>
                
                {error && (
                  <div className="mt-4 flex items-center text-red-400 text-sm bg-red-900/10 p-3 rounded border border-red-500/20">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* Success / Download */}
            {generatedFile && (
              <div className="bg-emerald-900/10 border border-emerald-500/30 p-6 rounded-lg flex flex-col items-center text-center animate-in slide-in-from-bottom-2">
                <div className="bg-emerald-500/20 p-3 rounded-full mb-3">
                  <Layers className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Arquivo Criado com Sucesso!</h3>
                <p className="text-sm text-emerald-200/70 mb-6">
                  {generatedFile.name} ({(generatedFile.size / 1024).toFixed(1)} KB)
                </p>
                
                <div className="flex space-x-3">
                  <button
                    onClick={handleDownload}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold flex items-center shadow-lg shadow-emerald-900/20 transition-all hover:scale-105"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Baixar PDF
                  </button>
                  <button
                    onClick={() => setGeneratedFile(null)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2 rounded-lg font-medium border border-slate-600"
                  >
                    Recortar Outro
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

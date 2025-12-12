import React, { useEffect, useState } from 'react';
import { X, ExternalLink, FileText } from 'lucide-react';

interface PDFPreviewModalProps {
  file: File | null;
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
}

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({ file, isOpen, onClose, fileName }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // Manage Object URL lifecycle to prevent memory leaks and ensure valid URLs
  useEffect(() => {
    if (file && isOpen) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      
      // Cleanup function to revoke URL when component unmounts or file changes
      return () => {
        URL.revokeObjectURL(url);
        setObjectUrl(null);
      };
    }
  }, [file, isOpen]);

  if (!isOpen || !file || !objectUrl) return null;

  const isImage = file.type.startsWith('image/');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-slate-700 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <h3 className="text-white font-medium truncate max-w-lg flex items-center">
            <span className="mr-2 opacity-70">Visualizando:</span> {fileName}
          </h3>
          <div className="flex items-center space-x-2">
            <a 
              href={objectUrl} 
              target="_blank" 
              rel="noreferrer"
              className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
              title="Abrir em nova aba"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center rounded-b-xl">
          {isImage ? (
             <img 
               src={objectUrl} 
               alt="Preview" 
               className="max-w-full max-h-full object-contain p-4" 
             />
          ) : (
            <object 
              data={objectUrl} 
              type="application/pdf" 
              className="w-full h-full"
            >
              {/* Fallback content if PDF fails to load */}
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                <FileText className="w-16 h-16 mb-4 opacity-50" />
                <h4 className="text-lg font-medium text-slate-300 mb-2">Não foi possível exibir o PDF aqui.</h4>
                <p className="mb-6 max-w-md mx-auto">
                  Alguns navegadores bloqueiam a visualização de PDFs locais. 
                  Você pode baixá-lo ou abri-lo em uma nova aba.
                </p>
                <a 
                  href={objectUrl} 
                  download={fileName} 
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                >
                  Baixar para Visualizar
                </a>
              </div>
            </object>
          )}
        </div>
      </div>
    </div>
  );
};
import React, { useRef } from 'react';
import { UploadCloud, FileCheck, Receipt, ScrollText } from 'lucide-react';
import { DocumentType } from '../types';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
  selectedType: DocumentType;
  onTypeChange: (type: DocumentType) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onFilesSelected, 
  disabled, 
  selectedType, 
  onTypeChange 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const TypeButton = ({ type, label, icon: Icon }: { type: DocumentType; label: string; icon: any }) => (
    <button
      onClick={() => onTypeChange(type)}
      className={`
        flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
        ${selectedType === type 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}
      `}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-center space-x-3 mb-2">
        <TypeButton type="comprovante" label="Comprovante" icon={FileCheck} />
        <TypeButton type="boleto" label="Boleto" icon={Receipt} />
        <TypeButton type="nota_fiscal" label="Nota Fiscal" icon={ScrollText} />
      </div>

      <div
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          relative border-2 border-dashed rounded-xl p-8 
          flex flex-col items-center justify-center 
          transition-all duration-300 cursor-pointer
          ${disabled 
            ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed' 
            : 'border-blue-500/30 bg-slate-800/30 hover:border-blue-500 hover:bg-slate-800/80'
          }
        `}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          accept="application/pdf,image/*"
          disabled={disabled}
        />
        <div className="bg-slate-700 p-4 rounded-full mb-4">
          <UploadCloud className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-200 mb-1">
          Importar {selectedType === 'comprovante' ? 'Comprovantes' : selectedType === 'boleto' ? 'Boletos' : 'Notas Fiscais'}
        </h3>
        <p className="text-sm text-slate-400 text-center max-w-sm">
          Arraste e solte seus arquivos aqui ou clique para buscar.
          <br/>
          <span className="text-xs text-slate-500">Todos os arquivos serão classificados como: <strong className="text-blue-400">{selectedType.toUpperCase().replace('_', ' ')}</strong></span>
        </p>
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { AnalyzedFile, AnalysisStatus, DocumentType } from '../types';
import { 
  FileText, CheckCircle2, AlertCircle, Loader2, 
  Edit2, Save, Trash2, Download, Eye, X, PlusCircle, Lock, Unlock
} from 'lucide-react';

interface FileCardProps {
  item: AnalyzedFile;
  onUpdate: (id: string, updates: Partial<AnalyzedFile>) => void;
  onDelete: (id: string) => void;
  onDownload: (item: AnalyzedFile) => void;
  onPreview: (item: AnalyzedFile) => void;
  onUnlock?: (id: string, password: string) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ item, onUpdate, onDelete, onDownload, onPreview, onUnlock }) => {
  const [localData, setLocalData] = useState(item.data);
  const [localDocType, setLocalDocType] = useState<DocumentType>(item.docType);
  const [isEditing, setIsEditing] = useState(false);
  const [isCustomTypeMode, setIsCustomTypeMode] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Check if the incoming type is standard or custom
  useEffect(() => {
    setLocalData(item.data);
    setLocalDocType(item.docType);
    
    const standardTypes = ['comprovante', 'boleto', 'nota_fiscal'];
    if (!standardTypes.includes(item.docType)) {
      setIsCustomTypeMode(true);
    } else {
      setIsCustomTypeMode(false);
    }
  }, [item.data, item.docType]);

  const generateSuggestedName = (date: string, beneficiary: string, value: string, type: string) => {
    const safeBeneficiary = beneficiary
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .toUpperCase();
    
    const safeValue = value.replace(/\./g, ''); 

    let typeLabel = type.toUpperCase();
    // Handle nice formatting for standard types, raw uppercase for custom
    if (type === 'nota_fiscal') typeLabel = 'NOTA FISCAL';
    
    return `${date}_${safeBeneficiary}_${safeValue}_${typeLabel}.pdf`;
  };

  const currentType = isEditing ? localDocType : item.docType;
  
  const currentSuggestedName = localData 
    ? generateSuggestedName(localData.date, localData.beneficiary, localData.value, currentType)
    : 'Aguardando análise...';

  const handleSave = () => {
    if (localData) {
      onUpdate(item.id, { 
        data: localData, 
        docType: localDocType 
      });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setLocalData(item.data);
    setLocalDocType(item.docType);
    setIsEditing(false);
    
    const standardTypes = ['comprovante', 'boleto', 'nota_fiscal'];
    setIsCustomTypeMode(!standardTypes.includes(item.docType));
  };

  const handleUnlockSubmit = async () => {
    if (onUnlock && passwordInput) {
      setIsUnlocking(true);
      await onUnlock(item.id, passwordInput);
      setIsUnlocking(false);
      setPasswordInput('');
    }
  };

  const handleTypeSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustomTypeMode(true);
      setLocalDocType(''); // Reset so user can type
    } else {
      setIsCustomTypeMode(false);
      setLocalDocType(val);
    }
  };

  const StatusIcon = () => {
    switch (item.status) {
      case AnalysisStatus.PROCESSING:
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case AnalysisStatus.COMPLETE:
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case AnalysisStatus.ERROR:
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case AnalysisStatus.WAITING_PASSWORD:
        return <Lock className="w-5 h-5 text-orange-400" />;
      default:
        return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  const getBadgeColor = () => {
    switch(item.docType) {
      case 'boleto': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'nota_fiscal': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'comprovante': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'; // Custom types
    }
  };

  return (
    <div className={`bg-slate-800 rounded-lg border overflow-hidden shadow-sm hover:shadow-md transition-all ${item.status === AnalysisStatus.WAITING_PASSWORD ? 'border-orange-500/50' : 'border-slate-700'}`}>
      {/* Header */}
      <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <StatusIcon />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-slate-300 truncate max-w-[200px]" title={item.originalName}>
              {item.originalName}
            </span>
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border w-fit ${getBadgeColor()}`}>
              {item.docType === 'nota_fiscal' ? 'NOTA FISCAL' : item.docType.toUpperCase()}
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          {item.status !== AnalysisStatus.WAITING_PASSWORD && (
            <button 
              onClick={() => onPreview(item)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
              title="Visualizar PDF"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {item.status === AnalysisStatus.COMPLETE && !isEditing && (
            <button 
              onClick={() => setIsEditing(true)}
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700/50 rounded transition-colors"
              title="Editar"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={() => onDelete(item.id)}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {item.status === AnalysisStatus.PROCESSING && (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500 space-y-2">
            <Loader2 className="w-8 h-8 animate-spin opacity-50" />
            <p className="text-sm">Lendo documento...</p>
          </div>
        )}

        {item.status === AnalysisStatus.ERROR && (
          <div className="text-red-400 text-sm py-2">
            Erro: {item.errorMessage || "Falha na análise"}
          </div>
        )}

        {/* Password Input UI */}
        {item.status === AnalysisStatus.WAITING_PASSWORD && (
          <div className="bg-orange-900/10 border border-orange-500/20 rounded p-4 flex flex-col space-y-3">
             <div className="flex items-center text-orange-400 text-sm font-medium">
               <Lock className="w-4 h-4 mr-2" />
               Este arquivo está protegido por senha.
             </div>
             <p className="text-xs text-slate-400">Insira a senha abaixo para desbloquear e renomear.</p>
             
             {item.errorMessage && (
                <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1.5" />
                  {item.errorMessage}
                </div>
             )}

             <div className="flex items-center space-x-2">
                <input 
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Senha do PDF"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlockSubmit()}
                />
                <button 
                  onClick={handleUnlockSubmit}
                  disabled={!passwordInput || isUnlocking}
                  className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUnlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                  <span className="ml-2">Desbloquear</span>
                </button>
             </div>
          </div>
        )}

        {item.status === AnalysisStatus.COMPLETE && localData && (
          <div className="space-y-4">
            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                 {/* Row 1: Type, Date, Value */}
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">Tipo</label>
                  {isCustomTypeMode ? (
                    <div className="flex items-center space-x-1">
                      <input 
                        type="text"
                        value={localDocType}
                        onChange={(e) => setLocalDocType(e.target.value)}
                        placeholder="Ex: RECIBO"
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none uppercase"
                        autoFocus
                      />
                      <button 
                        onClick={() => { setIsCustomTypeMode(false); setLocalDocType('comprovante'); }}
                        className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                        title="Voltar para lista"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={localDocType}
                      onChange={handleTypeSelectChange}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="comprovante">Comprovante</option>
                      <option value="boleto">Boleto</option>
                      <option value="nota_fiscal">Nota Fiscal</option>
                      <option value="custom">Outro (Personalizado)...</option>
                    </select>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">Data (ddmmYYYY)</label>
                  <input
                    type="text"
                    value={localData.date}
                    onChange={(e) => setLocalData({ ...localData, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">Valor</label>
                  <input
                    type="text"
                    value={localData.value}
                    onChange={(e) => setLocalData({ ...localData, value: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                
                {/* Row 2: Name (Full width) */}
                <div className="space-y-1 md:col-span-3">
                  <label className="text-xs text-slate-500 uppercase font-bold">Nome</label>
                  <input
                    type="text"
                    value={localData.beneficiary}
                    onChange={(e) => setLocalData({ ...localData, beneficiary: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                
                {/* Buttons */}
                <div className="md:col-span-3 flex justify-end space-x-2 mt-2">
                  <button onClick={handleCancel} className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white bg-slate-700 rounded flex items-center">
                    <X className="w-3 h-3 mr-1" /> Cancelar
                  </button>
                  <button onClick={handleSave} className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-500 rounded flex items-center">
                    <Save className="w-3 h-3 mr-1" /> Salvar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="block text-xs text-slate-500 uppercase mb-0.5">Data</span>
                    <span className="text-slate-200 font-mono">{localData.date}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500 uppercase mb-0.5">Nome</span>
                    <span className="text-slate-200 font-medium truncate block" title={localData.beneficiary}>
                      {localData.beneficiary}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500 uppercase mb-0.5">Valor</span>
                    <span className="text-emerald-400 font-mono font-bold">R$ {localData.value}</span>
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded p-3 border border-slate-700/50 mt-2">
                  <span className="block text-[10px] text-slate-500 uppercase mb-1">Nome do Arquivo</span>
                  <div className="flex items-center justify-between">
                    <code className="text-sm text-blue-300 break-all select-all">
                      {currentSuggestedName}
                    </code>
                    <button
                      onClick={() => onDownload(item)}
                      className="ml-3 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors shadow-lg shadow-blue-900/20"
                      title="Baixar Arquivo"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
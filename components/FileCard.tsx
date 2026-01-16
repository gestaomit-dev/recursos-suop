import React, { useState, useEffect } from 'react';
import { AnalyzedFile, AnalysisStatus, DocumentType } from '../types';
import { 
  FileText, CheckCircle2, AlertCircle, Loader2, 
  Edit2, Save, Trash2, Download, Eye, X, Lock, Unlock
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

  useEffect(() => {
    setLocalData(item.data);
    setLocalDocType(item.docType);
    const standardTypes = ['comprovante', 'boleto', 'nota_fiscal'];
    setIsCustomTypeMode(!standardTypes.includes(item.docType));
  }, [item.data, item.docType]);

  const generateSuggestedName = (date: string, beneficiary: string, value: string, type: string, docNumber?: string) => {
    const safeBeneficiary = beneficiary.replace(/[\\/:*?"<>|]/g, '').trim().toUpperCase();
    const safeValue = value.replace(/\./g, '');
    const safeDocNumber = docNumber ? docNumber.replace(/[\\/:*?"<>|]/g, '').trim().toUpperCase() : '';
    let typeLabel = type.toUpperCase();
    if (type === 'nota_fiscal') typeLabel = 'NOTA FISCAL';
    
    const parts = [date, safeBeneficiary];
    if (safeDocNumber) parts.push(safeDocNumber);
    parts.push(safeValue);
    parts.push(typeLabel);

    return `${parts.join('_')}.pdf`;
  };

  const handleSave = () => {
    if (localData) {
      onUpdate(item.id, { data: localData, docType: localDocType });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setLocalData(item.data);
    setLocalDocType(item.docType);
    setIsEditing(false);
  };

  const handleUnlockSubmit = async () => {
    if (onUnlock && passwordInput) {
      setIsUnlocking(true);
      await onUnlock(item.id, passwordInput);
      setIsUnlocking(false);
      setPasswordInput('');
    }
  };

  const currentSuggestedName = localData 
    ? generateSuggestedName(localData.date, localData.beneficiary, localData.value, isEditing ? localDocType : item.docType, localData.docNumber)
    : 'Aguardando análise...';

  const StatusIcon = () => {
    switch (item.status) {
      case AnalysisStatus.PROCESSING: return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case AnalysisStatus.COMPLETE: return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case AnalysisStatus.ERROR: return <AlertCircle className="w-5 h-5 text-red-400" />;
      case AnalysisStatus.WAITING_PASSWORD: return <Lock className="w-5 h-5 text-orange-400" />;
      default: return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  const getBadgeColor = () => {
    switch(item.docType) {
      case 'boleto': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'nota_fiscal': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'comprovante': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className={`bg-slate-800 rounded-lg border overflow-hidden shadow-sm hover:shadow-md transition-all ${item.status === AnalysisStatus.WAITING_PASSWORD ? 'border-orange-500/50' : 'border-slate-700'}`}>
      <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-3 overflow-hidden">
          <StatusIcon />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-slate-300 truncate max-w-[200px]" title={item.originalName}>{item.originalName}</span>
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border w-fit ${getBadgeColor()}`}>
              {item.docType === 'nota_fiscal' ? 'NOTA FISCAL' : item.docType.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          {item.status !== AnalysisStatus.WAITING_PASSWORD && <button onClick={() => onPreview(item)} className="p-1.5 text-slate-400 hover:text-white rounded transition-colors"><Eye className="w-4 h-4" /></button>}
          {item.status === AnalysisStatus.COMPLETE && !isEditing && <button onClick={() => setIsEditing(true)} className="p-1.5 text-slate-400 hover:text-blue-400 rounded transition-colors"><Edit2 className="w-4 h-4" /></button>}
          <button onClick={() => onDelete(item.id)} className="p-1.5 text-slate-400 hover:text-red-400 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="p-4">
        {item.status === AnalysisStatus.PROCESSING && <div className="flex flex-col items-center justify-center py-6 text-slate-500 space-y-2"><Loader2 className="w-8 h-8 animate-spin opacity-50" /><p className="text-sm">Lendo documento...</p></div>}
        {item.status === AnalysisStatus.ERROR && <div className="text-red-400 text-sm py-2">Erro: {item.errorMessage}</div>}
        {item.status === AnalysisStatus.WAITING_PASSWORD && (
          <div className="bg-orange-900/10 border border-orange-500/20 rounded p-4 flex flex-col space-y-3">
             <div className="flex items-center text-orange-400 text-sm font-medium"><Lock className="w-4 h-4 mr-2" /> Protegido por senha.</div>
             <div className="flex items-center space-x-2">
                <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Senha do PDF" className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none" />
                <button onClick={handleUnlockSubmit} disabled={!passwordInput || isUnlocking} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center">{isUnlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}<span className="ml-2">Desbloquear</span></button>
             </div>
          </div>
        )}

        {item.status === AnalysisStatus.COMPLETE && localData && (
          <div className="space-y-4">
            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">Tipo</label>
                  <select value={localDocType} onChange={(e) => setLocalDocType(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white">
                    <option value="comprovante">Comprovante</option>
                    <option value="boleto">Boleto</option>
                    <option value="nota_fiscal">Nota Fiscal</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">Data</label>
                  <input type="text" value={localData.date} onChange={(e) => setLocalData({ ...localData, date: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">Número</label>
                  <input type="text" value={localData.docNumber || ''} onChange={(e) => setLocalData({ ...localData, docNumber: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white" placeholder="Não encontrado" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">Valor</label>
                  <input type="text" value={localData.value} onChange={(e) => setLocalData({ ...localData, value: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white" />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <label className="text-xs text-slate-500 uppercase font-bold">Nome</label>
                  <input type="text" value={localData.beneficiary} onChange={(e) => setLocalData({ ...localData, beneficiary: e.target.value.toUpperCase() })} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white" />
                </div>
                <div className="md:col-span-4 flex justify-end space-x-2">
                  <button onClick={handleCancel} className="px-3 py-1 text-xs font-medium text-slate-400 bg-slate-700 rounded flex items-center"><X className="w-3 h-3 mr-1" /> Cancelar</button>
                  <button onClick={handleSave} className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded flex items-center"><Save className="w-3 h-3 mr-1" /> Salvar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="block text-xs text-slate-500 uppercase mb-0.5">Data</span><span className="text-slate-200 font-mono">{localData.date}</span></div>
                  <div><span className="block text-xs text-slate-500 uppercase mb-0.5">Número</span><span className="text-slate-200 truncate block">{localData.docNumber || '-'}</span></div>
                  <div><span className="block text-xs text-slate-500 uppercase mb-0.5">Nome</span><span className="text-slate-200 font-medium truncate block" title={localData.beneficiary}>{localData.beneficiary}</span></div>
                  <div><span className="block text-xs text-slate-500 uppercase mb-0.5">Valor</span><span className="text-emerald-400 font-mono font-bold">R$ {localData.value}</span></div>
                </div>
                <div className="bg-slate-900/50 rounded p-3 border border-slate-700/50 mt-2 flex items-center justify-between">
                  <code className="text-sm text-blue-300 break-all select-all">{currentSuggestedName}</code>
                  <button onClick={() => onDownload(item)} className="ml-3 p-1.5 bg-blue-600 text-white rounded-md shadow-lg" title="Baixar Arquivo"><Download className="w-4 h-4" /></button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
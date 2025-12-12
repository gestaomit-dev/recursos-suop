
export enum AnalysisStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
  WAITING_PASSWORD = 'WAITING_PASSWORD',
}

export type DocumentType = 'comprovante' | 'boleto' | 'nota_fiscal' | string;

export interface ExtractedData {
  date: string;         // ddmmYYYY
  beneficiary: string;  // Normalized name
  value: string;        // 1.234,56
  originalValue: string; // Raw value found
  explanation?: string;  // Which keywords were used
}

export interface AnalyzedFile {
  id: string;
  file: File;
  originalName: string;
  docType: DocumentType;
  status: AnalysisStatus;
  data: ExtractedData | null;
  errorMessage?: string;
  isEditing?: boolean;
}

export interface ProcessingStats {
  total: number;
  processed: number;
  success: number;
}
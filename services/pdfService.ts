import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar o Worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

/**
 * Verifica se um arquivo PDF está protegido por senha.
 */
export const isPdfEncrypted = async (file: File): Promise<boolean> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Tenta carregar sem senha. Se falhar com erro de encriptação, retorna true.
    await PDFDocument.load(arrayBuffer);
    return false;
  } catch (error: any) {
    if (error.message && error.message.toLowerCase().includes('encrypted')) {
      return true;
    }
    // Se for outro erro (arquivo corrompido, etc), não consideramos como encriptado para fins de senha
    return false;
  }
};

/**
 * Tenta desbloquear um PDF com a senha fornecida e retorna um novo File descriptografado.
 */
export const unlockPdf = async (file: File, password: string): Promise<File> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Carrega com a senha
    // @ts-ignore: pdf-lib types do not include password property, but we attempt to pass it.
    const pdfDoc = await PDFDocument.load(arrayBuffer, { password } as any);
    
    // Salva novamente (o pdf-lib salva descriptografado por padrão se carregado com senha)
    const pdfBytes = await pdfDoc.save();
    
    return new File(
      [pdfBytes],
      file.name, // Mantém o mesmo nome
      { type: 'application/pdf' }
    );
  } catch (error) {
    console.error("Erro ao desbloquear PDF:", error);
    throw new Error("Senha incorreta ou falha ao desbloquear.");
  }
};

export const splitPdfByPage = async (file: File): Promise<File[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const numberOfPages = pdfDoc.getPageCount();
    const separatedFiles: File[] = [];

    const baseName = file.name.replace(/\.pdf$/i, '');

    // Loop through each page and create a new PDF
    for (let i = 0; i < numberOfPages; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);
      
      const pdfBytes = await newPdf.save();
      
      // Create a new File object
      const newFile = new File(
        [pdfBytes], 
        `${baseName}_Pagina_${i + 1}.pdf`, 
        { type: 'application/pdf' }
      );
      
      separatedFiles.push(newFile);
    }

    return separatedFiles;
  } catch (error) {
    console.error("Error splitting PDF:", error);
    throw new Error("Falha ao separar o PDF. Verifique se o arquivo não está corrompido ou protegido por senha.");
  }
};

/**
 * Cria um novo PDF contendo apenas as páginas especificadas (índices baseados em 1).
 */
export const extractPagesFromPdf = async (file: File, pageNumbers: number[]): Promise<File> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();
    const newPdf = await PDFDocument.create();

    // Filtra páginas válidas e converte para índice 0-based
    const validPageIndices: number[] = [];
    
    for (const p of pageNumbers) {
      if (p >= 1 && p <= totalPages) {
        validPageIndices.push(p - 1);
      }
    }

    if (validPageIndices.length === 0) {
      throw new Error("Nenhuma página válida selecionada.");
    }

    // Copia as páginas
    const copiedPages = await newPdf.copyPages(pdfDoc, validPageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    
    const baseName = file.name.replace(/\.pdf$/i, '');
    const suffix = validPageIndices.length === 1 
      ? `Pg${validPageIndices[0] + 1}` 
      : `Recorte`;

    return new File(
      [pdfBytes],
      `${baseName}_${suffix}.pdf`,
      { type: 'application/pdf' }
    );

  } catch (error: any) {
    console.error("Error extracting pages:", error);
    throw new Error(error.message || "Falha ao recortar o PDF.");
  }
};

/**
 * Converte a primeira página de um PDF para um arquivo de imagem (JPEG).
 * Isso força a IA a usar visão computacional em vez de ler a camada de texto.
 */
export const convertPdfToImage = async (file: File): Promise<File> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // Pega a primeira página
    const page = await pdf.getPage(1);
    
    // Define escala alta para garantir que o QR Code fique legível (scale 3.0 é aprox 200-300 DPI)
    const viewport = page.getViewport({ scale: 3.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error('Falha ao criar contexto do Canvas');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Converte para Blob/File
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const imageFile = new File([blob], file.name.replace('.pdf', '.jpg'), { type: 'image/jpeg' });
          resolve(imageFile);
        } else {
          reject(new Error('Falha ao converter canvas para blob'));
        }
      }, 'image/jpeg', 0.95);
    });
    
  } catch (error) {
    console.error("Erro ao converter PDF para Imagem:", error);
    throw new Error("Não foi possível renderizar o PDF como imagem.");
  }
};
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData, DocumentType } from "../types";
import jsQR from "jsqr";
import { convertPdfToImage, isPdfEncrypted } from "./pdfService";

const getSystemPrompt = (docType: DocumentType) => {
  const basePrompt = `
Você é um assistente especializado em análise de documentos financeiros.
Sua função é extrair informações para renomeação de arquivos de forma precisa.

REGRAS GERAIS DE EXTRAÇÃO:
1. DATA (formato ddmmYYYY): Converta para apenas números (8 dígitos).
2. NOME (Beneficiário/Emitente): MAIÚSCULAS. Mantenha espaços entre palavras. Remova pontuação (. , - /).
3. VALOR (Formato BR): Ex: 1.234,56. Mantenha a vírgula decimal.
4. NÚMERO DO DOCUMENTO: Extraia APENAS se houver um rótulo explícito e próximo como "Número", "NF-e", "Nº da Nota", "Fatura Nº" ou "Doc".
   - CRÍTICO: Se encontrar um número sem um título que o identifique como o número do documento/nota, retorne obrigatoriamente null. Não tente "adivinhar" o número ou usar chaves de acesso.
   - PROIBIDO: Não capture chaves de acesso de 44 dígitos, códigos de barras, IDs de autenticação bancária, protocolos ou números aleatórios soltos.

CONTEXTO ESPECÍFICO DO TIPO "${docType.toUpperCase()}":
`;

  switch (docType) {
    case 'boleto':
      return basePrompt + `
      - DATA: CRÍTICO: Extraia exclusivamente a "DATA DE VENCIMENTO". Se o documento for um boleto ou uma FATURA, você deve ignorar a data de emissão e usar obrigatoriamente o vencimento.
      - NOME: Procure por "Beneficiário", "Cedente" ou "Razão Social" do emissor.
      - VALOR: Procure por "Valor do Documento" ou "Total a Pagar".
      - NÚMERO: Capture o "Número do Documento" ou "Nosso Número" apenas se houver título claro. Caso contrário, retorne null.
      `;
    case 'nota_fiscal':
      return basePrompt + `
      - DATA: Priorize "Data de Vencimento" se disponível (comum em faturas conjugadas). Caso contrário, use "Data de Emissão".
      - NOME: Procure por "Emitente", "Prestador" ou "Razão Social".
      - VALOR: Procure por "Valor Total da Nota".
      - NÚMERO: Capture o "Número da Nota" ou "Número". Ignore chaves de acesso longas.
      `;
    case 'comprovante':
    default:
      return basePrompt + `
      - DATA: Priorize "Data do Pagamento" ou "Data da Operação".
      - NOME: Procure por "Beneficiário", "Favorecido", "Destino".
      - VALOR: Procure por "Valor Pago".
      - NÚMERO: Procure por "Autenticação", "Controle" ou "ID da Transação". Se não houver título claro precedendo o número, retorne null.
      `;
  }
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    date: {
      type: Type.STRING,
      description: "Data principal (vencimento se boleto/fatura) no formato ddmmYYYY",
    },
    beneficiary: {
      type: Type.STRING,
      description: "Nome limpo em MAIÚSCULAS",
    },
    value: {
      type: Type.STRING,
      description: "Valor formatado em PT-BR (ex: 1.234,56)",
    },
    docNumber: {
      type: Type.STRING,
      description: "Número oficial rotulado no documento. Null se não houver título claro.",
    },
    explanation: {
      type: Type.STRING,
      description: "Explicação curta de onde os dados vieram",
    },
  },
  required: ["date", "beneficiary", "value"],
};

export const analyzeDocument = async (file: File, docType: DocumentType): Promise<ExtractedData> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key não configurada no ambiente.");
  }

  if (file.type === 'application/pdf') {
    const isEncrypted = await isPdfEncrypted(file);
    if (isEncrypted) {
      throw new Error("PASSWORD_REQUIRED");
    }
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64Data = await fileToBase64(file);
  const mimeType = file.type;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: getSystemPrompt(docType),
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: `Analise este documento financeiro. Se for uma FATURA ou BOLETO, você deve obrigatoriamente usar a DATA DE VENCIMENTO. Se não houver número identificado por um título explícito (ex: Nº, Nota, Doc), deixe docNumber como null.`,
          },
        ],
      },
    });

    const text = response.text;
    if (!text) throw new Error("Sem resposta do Gemini");

    const data = JSON.parse(text) as ExtractedData;
    
    return {
      date: data.date || new Date().toLocaleDateString('pt-BR').replace(/\//g, ''),
      beneficiary: data.beneficiary || "DESCONHECIDO",
      value: data.value || "0,00",
      originalValue: data.value || "0,00",
      docNumber: data.docNumber || undefined,
      explanation: data.explanation || "Extraído automaticamente.",
    };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

const readQrCodeLocally = async (file: File): Promise<string | null> => {
  try {
    let imageFile = file;
    if (file.type === 'application/pdf') {
      try {
        imageFile = await convertPdfToImage(file);
      } catch (e) {
        return null;
      }
    }
    const imageUrl = URL.createObjectURL(imageFile);
    const img = new Image();
    img.src = imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(img, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    URL.revokeObjectURL(imageUrl);
    return code ? code.data : null;
  } catch (error) {
    return null;
  }
};

const PAYMENT_CODE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    barCode: {
      type: Type.STRING,
      description: "A linha digitável do boleto (47 ou 48 números). Null se não encontrado.",
    },
  },
};

export const extractBoletoCode = async (file: File): Promise<{ barCode?: string; pixCode?: string; found: boolean }> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key não encontrada");
  let localPixCode = await readQrCodeLocally(file);
  if (localPixCode && !localPixCode.startsWith('000201')) {
    if (localPixCode.length < 20) localPixCode = null;
  }
  const ai = new GoogleGenAI({ apiKey });
  const base64Data = await fileToBase64(file);
  let extractedBarCode: string | null = null;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: `Extrair APENAS a Linha Digitável deste documento.`,
        responseMimeType: "application/json",
        responseSchema: PAYMENT_CODE_SCHEMA,
      },
      contents: {
        parts: [
          { inlineData: { mimeType: file.type, data: base64Data } },
          { text: "Extraia a linha digitável do boleto." },
        ],
      },
    });
    const text = response.text;
    if (text) {
      const result = JSON.parse(text);
      if (result.barCode) {
        const clean = result.barCode.replace(/[^0-9]/g, '');
        if (clean.length >= 36) extractedBarCode = clean;
      }
    }
  } catch (error) {}
  return {
    barCode: extractedBarCode || undefined,
    pixCode: localPixCode || undefined,
    found: !!(extractedBarCode || localPixCode)
  };
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};
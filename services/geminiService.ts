import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ExtractedData, DocumentType } from "../types";
import jsQR from "jsqr";
import { convertPdfToImage, isPdfEncrypted } from "./pdfService";

const getSystemPrompt = (docType: DocumentType) => {
  const basePrompt = `
Você é um assistente especializado em análise de documentos financeiros.
Sua função é extrair informações para renomeação de arquivos.

REGRAS GERAIS DE EXTRAÇÃO:
1. DATA (formato ddmmYYYY): Converta para apenas números.
2. NOME (Beneficiário/Emitente): MAIÚSCULAS. Mantenha espaços entre palavras. Remova pontuação (. , - /).
3. VALOR (Formato BR): Ex: 1.234,56. Mantenha a vírgula decimal.

CONTEXTO ESPECÍFICO DO TIPO "${docType.toUpperCase()}":
`;

  switch (docType) {
    case 'boleto':
      return basePrompt + `
      - DATA: CRÍTICO: Use a "Data de Vencimento". NÃO use a data de emissão ou processamento. Se não houver vencimento explícito, use a data do documento.
      - NOME: Procure por "Beneficiário", "Cedente" ou a Razão Social de quem recebe.
      - VALOR: Procure por "Valor do Documento" ou "Valor Cobrado".
      `;
    case 'nota_fiscal':
      return basePrompt + `
      - DATA: CRÍTICO: Priorize a "Data de Vencimento" (faturas) ou "Data de Saída/Entrada". NÃO use a "Data de Emissão" a menos que não exista data de vencimento ou circulação.
      - NOME: Procure por "Emitente", "Prestador de Serviços" ou "Razão Social".
      - VALOR: Procure por "Valor Total da Nota" ou "Valor Líquido".
      `;
    case 'comprovante':
    default:
      return basePrompt + `
      - DATA: CRÍTICO: Priorize a "Data de Vencimento" (se disponível no detalhe do pagamento) ou "Data do Pagamento/Agendamento". NÃO use a "Data de Emissão" ou "Data de Impressão" do comprovante.
      - NOME: Procure por "Beneficiário", "Favorecido", "Destino".
      - VALOR: Procure por "Valor Pago", "Valor da Transação".
      `;
  }
};

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    date: {
      type: Type.STRING,
      description: "Data principal no formato ddmmYYYY",
    },
    beneficiary: {
      type: Type.STRING,
      description: "Nome limpo em MAIÚSCULAS (com espaços, sem símbolos)",
    },
    value: {
      type: Type.STRING,
      description: "Valor formatado em PT-BR (ex: 1.234,56)",
    },
    explanation: {
      type: Type.STRING,
      description: "Breve explicação da extração",
    },
  },
  required: ["date", "beneficiary", "value"],
};

export const analyzeDocument = async (file: File, docType: DocumentType): Promise<ExtractedData> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables.");
  }

  // Check for Password Protection before sending to API
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
      model: "gemini-2.5-flash",
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
            text: `Analise este documento do tipo ${docType} e extraia os dados.`,
          },
        ],
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const data = JSON.parse(text) as ExtractedData;
    
    return {
      date: data.date || new Date().toLocaleDateString('pt-BR').replace(/\//g, ''),
      beneficiary: data.beneficiary || "DESCONHECIDO",
      value: data.value || "0,00",
      originalValue: data.value || "0,00",
      explanation: data.explanation || "Extraído automaticamente.",
    };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

// --- HELPER PARA LEITURA DETERMINÍSTICA DE QR CODE ---

const readQrCodeLocally = async (file: File): Promise<string | null> => {
  try {
    let imageFile = file;

    // Se for PDF, converte a primeira página para imagem
    if (file.type === 'application/pdf') {
      try {
        imageFile = await convertPdfToImage(file);
      } catch (e) {
        console.warn("Falha ao converter PDF para imagem para leitura QR:", e);
        return null;
      }
    }

    // Criar um elemento de imagem HTML para carregar os dados
    const imageUrl = URL.createObjectURL(imageFile);
    const img = new Image();
    img.src = imageUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // Desenhar no canvas para pegar os dados de pixel
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const context = canvas.getContext('2d');
    
    if (!context) return null;

    context.drawImage(img, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Usar jsQR para ler os dados reais
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    URL.revokeObjectURL(imageUrl);

    if (code) {
      return code.data;
    }
    return null;
  } catch (error) {
    console.error("Erro na leitura local do QR:", error);
    return null;
  }
};

// --- UPDATED FUNCTION FOR BARCODE & PIX EXTRACTION ---

const PAYMENT_CODE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    barCode: {
      type: Type.STRING,
      description: "A linha digitável do boleto (47 ou 48 números). Null se não encontrado.",
    },
    // Removido pixCode do Schema da IA para evitar alucinação
  },
  // O Schema agora é opcional ou parcial, focamos no barCode
};

export const extractBoletoCode = async (file: File): Promise<{ barCode?: string; pixCode?: string; found: boolean }> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  // 1. Tenta ler o QR Code LOCALMENTE (Determinístico - Zero Alucinação)
  // Isso resolve o problema de códigos "aleatórios" gerados pela IA.
  let localPixCode: string | null = null;
  try {
    localPixCode = await readQrCodeLocally(file);
    // Validação básica: Pix Copia e Cola geralmente começa com 000201
    if (localPixCode && !localPixCode.startsWith('000201')) {
      // Se não começar com 000201, pode ser outro QR, mas vamos aceitar se parecer longo o suficiente
      if (localPixCode.length < 20) localPixCode = null;
    }
  } catch (e) {
    console.warn("Erro ao tentar ler QR localmente:", e);
  }

  // 2. Usa a IA APENAS para ler a Linha Digitável (Texto/OCR)
  const ai = new GoogleGenAI({ apiKey });
  const base64Data = await fileToBase64(file);

  let extractedBarCode: string | null = null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: `
          TAREFA: Extrair APENAS a Linha Digitável (Código de Barras Numérico) deste documento.
          
          REGRAS:
          1. Procure por sequências numéricas longas (47 ou 48 dígitos).
          2. Ignore QR Codes ou códigos Pix (isso é feito externamente).
          3. Retorne apenas JSON com o campo 'barCode'.
          4. Se não encontrar, retorne null.
        `,
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
        // Limpeza agressiva
        const clean = result.barCode.replace(/[^0-9]/g, '');
        if (clean.length >= 36) { // Aceita linha digitável parcial se for longa o suficiente
           extractedBarCode = clean;
        }
      }
    }

  } catch (error) {
    console.error("Gemini Barcode Extraction Error:", error);
    // Se a IA falhar, não quebramos tudo se já tivermos o Pix
  }

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
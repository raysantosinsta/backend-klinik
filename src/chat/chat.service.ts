import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pipeline } from '@xenova/transformers';
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async processMessage(businessId: string, conversationId: string | null, message: string) {
    // 1. Vetorizar a pergunta do usuário com o modelo local (Xenova)
    console.log('Vetorizando pergunta do usuário...');
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    const output = await extractor(message, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    const vectorString = `[${vector.join(',')}]`;

    // 2. Buscar os top chunks relevantes no Prisma (pgvector)
    console.log('Buscando contexto no banco de dados...');
    const chunks: any[] = await this.prisma.$queryRaw`
      SELECT "content", 1 - ("embedding" <=> ${vectorString}::vector) as similarity
      FROM "DocumentChunk"
      WHERE "documentId" IN (
        SELECT "id" FROM "Document" WHERE "businessId" = ${businessId}
      )
      ORDER BY "embedding" <=> ${vectorString}::vector
      LIMIT 3;
    `;

    if (!chunks || chunks.length === 0) {
      return {
        answer: "Desculpe, não encontrei informações sobre isso na base de conhecimento da clínica.",
        fallback: true
      };
    }

    const context = chunks.map((c) => c.content).join('\n\n');
    console.log('Contexto recuperado:', context);

    // 2.5. Buscar Serviços Disponíveis
    const services = await this.prisma.service.findMany({
      where: { businessId }
    });
    const servicesContext = services.length > 0 
      ? "Serviços disponíveis: " + services.map(s => `${s.name} (R$ ${s.price}, ${s.durationInMinutes}min)`).join(', ')
      : "Nenhum serviço cadastrado.";

    // 2.6 Buscar Histórico de Mensagens
    let historyContext = "";
    if (conversationId) {
      const history = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 6
      });
      historyContext = history.reverse().map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`).join('\n');
    }

    // 3. Chamar o LLM (Groq) para gerar a resposta
    console.log('Gerando resposta com Groq (Llama 3)...');
    try {
      const llm = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: "qwen/qwen3.8-27b", // Modelo disponível na conta da Groq
        temperature: 0.2, // Respostas mais precisas baseadas no contexto
        maxTokens: 800, // Evita erro de limite de tokens (OTPM) no tier gratuito
      });

      const prompt = `Você é um assistente virtual de uma clínica.
Responda à pergunta de forma educada e clara usando EXCLUSIVAMENTE as informações do contexto abaixo.
Se o cliente quiser agendar um serviço, você deve coletar: Nome, Serviço desejado, Data e Horário (em horário comercial).
Se faltar alguma dessas informações, pergunte na sua resposta. Se você já tem todas, marque isComplete como true.

Contexto da Clínica (Base de Conhecimento):
${context}

${servicesContext}

Histórico da Conversa Recente:
${historyContext}

Mensagem Atual do Cliente:
${message}`;

      const structuredLlm = llm.withStructuredOutput(
        z.object({
          answer: z.string().describe("Sua resposta ou pergunta ao cliente para prosseguir com o atendimento."),
          needsHumanFallback: z.boolean().describe("true se a resposta não estiver no contexto, exigindo transbordo para o humano."),
          intent: z.enum(["FAQ", "SCHEDULING", "OTHER"]).describe("Intenção do cliente."),
          extractedData: z.object({
            name: z.string().nullable().describe("Nome do cliente, se já informado."),
            service: z.string().nullable().describe("Nome do serviço desejado, se já informado."),
            date: z.string().nullable().describe("Data e hora desejada no formato ISO, se já informada e combinada."),
            isComplete: z.boolean().describe("Verdadeiro APENAS se o nome, serviço e data/hora já foram combinados e confirmados.")
          }).optional()
        }),
        { name: "generate_response" }
      );

      const aiResponse = await structuredLlm.invoke(prompt);
      
      return {
        answer: aiResponse.needsHumanFallback 
          ? "Desculpe, não sei responder a essa pergunta com as informações que tenho no momento. Gostaria de falar com um atendente humano?" 
          : aiResponse.answer,
        fallback: aiResponse.needsHumanFallback,
        extractedData: aiResponse.extractedData
      };
    } catch (e) {
      console.error('Erro ao chamar Gemini:', e);
      return {
        answer: "Ocorreu um erro interno ao formular a resposta. Por favor, aguarde o atendimento humano.",
        fallback: true
      };
    }
  }
}

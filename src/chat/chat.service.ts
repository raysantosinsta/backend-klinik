import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pipeline } from '@xenova/transformers';
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async processMessage(businessId: string, message: string) {
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

    // 3. Chamar o LLM (Groq) para gerar a resposta
    console.log('Gerando resposta com Groq (Llama 3)...');
    try {
      const llm = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: "qwen/qwen3.8-27b", // Modelo disponível na conta da Groq
        temperature: 0.2, // Respostas mais precisas baseadas no contexto
        maxTokens: 800, // Evita erro de limite de tokens (OTPM) no tier gratuito
      });

      const prompt = `Você é um assistente virtual de uma clínica de estética.
Responda à pergunta do cliente de forma educada, humanizada e clara usando EXCLUSIVAMENTE as informações do contexto abaixo.
REGRA CRÍTICA: Se o cliente perguntar sobre qualquer serviço, produto, preço ou informação que NÃO ESTEJA explicitamente listado no contexto, você DEVE definir 'needsHumanFallback' como true. Não tente deduzir ou responder negativamente (ex: "não vendemos comida"). Apenas acione o fallback.

Contexto da Clínica:
${context}

Pergunta do Cliente:
${message}`;

      const structuredLlm = llm.withStructuredOutput(
        z.object({
          answer: z.string().describe("A resposta para o cliente. Deixe em branco se acionar o fallback."),
          needsHumanFallback: z.boolean().describe("true se a resposta exata não estiver no contexto, exigindo transbordo para o humano.")
        }),
        { name: "generate_response" }
      );

      const aiResponse = await structuredLlm.invoke(prompt);
      
      return {
        answer: aiResponse.needsHumanFallback 
          ? "Desculpe, não sei responder a essa pergunta com as informações que tenho no momento. Gostaria de falar com um atendente humano?" 
          : aiResponse.answer,
        fallback: aiResponse.needsHumanFallback
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

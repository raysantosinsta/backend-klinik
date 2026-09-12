import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class WhatsappService {
  constructor(
    private prisma: PrismaService,
    private chatService: ChatService
  ) {}

  async processMessage(data: any) {
    try {
      const message = data?.message;
      if (!message) return;

      const key = data?.key;
      // Ignora mensagens enviadas pelo próprio bot
      if (!key || key.fromMe) return;

      const remoteJid = key.remoteJid;
      if (!remoteJid) return;
      
      // Extrai texto (pode vir em conversation ou extendedTextMessage)
      const text = message.conversation || message.extendedTextMessage?.text;
      if (!text) return; 

      // Pega o primeiro negócio cadastrado provisoriamente
      const business = await this.prisma.business.findFirst();
      if (!business) {
        console.error('Nenhum negócio cadastrado no banco.');
        return;
      }

      // Busca ou cria a sessão de conversa com este cliente
      let conversation = await this.prisma.conversation.findFirst({
        where: {
          businessId: business.id,
          clientPhone: remoteJid,
        },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            businessId: business.id,
            clientPhone: remoteJid,
            status: 'BOT',
          },
        });
      }

      // Salva a nova mensagem
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: text,
        },
      });

      console.log(`Mensagem recebida de ${remoteJid} e salva no histórico.`);

      // Se a conversa já foi transbordada para humano, a IA não responde mais
      if (conversation.status === 'HUMAN') {
        console.log(`Conversa com ${remoteJid} está em atendimento humano. IA ignorada.`);
        return;
      }

      // Gera resposta usando a IA
      console.log(`Gerando resposta via IA para ${remoteJid}...`);
      const aiResult = await this.chatService.processMessage(business.id, text);
      const answer = aiResult.answer;

      // Grava a resposta da IA no banco de dados
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: answer,
        },
      });

      // Se ocorreu fallback, transborda a conversa
      if (aiResult.fallback) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'HUMAN' },
        });
        console.log(`Conversa com ${remoteJid} alterada para status HUMAN devido ao fallback.`);
      }

      // Dispara a mensagem de volta para o WhatsApp usando a Evolution API
      const evoUrl = process.env.EVOLUTION_API_URL;
      const evoKey = process.env.EVOLUTION_API_KEY;
      const evoInstance = process.env.EVOLUTION_INSTANCE_NAME;

      if (!evoUrl || !evoKey || !evoInstance) {
        console.warn('⚠️ Credenciais do Evolution API não configuradas no .env. A resposta foi gerada mas não foi enviada ao WhatsApp.');
        console.log(`[Resposta Gerada]: ${answer}`);
        return;
      }

      try {
        const url = `${evoUrl}/message/sendText/${evoInstance}`;
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evoKey,
          },
          body: JSON.stringify({
            number: remoteJid,
            options: { delay: 1200, presence: 'composing' },
            text: answer,
          }),
        });
        console.log(`Resposta enviada ao WhatsApp (${remoteJid}) com sucesso.`);
      } catch (err) {
        console.error('Falha ao enviar requisição HTTP para o Evolution API:', err);
      }

    } catch (error) {
      console.error('Erro ao processar mensagem do Evolution API:', error);
    }
  }
}

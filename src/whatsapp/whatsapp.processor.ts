import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';

@Processor('whatsapp_messages')
export class WhatsappProcessor extends WorkerHost {
  constructor(
    private readonly httpService: HttpService,
    private readonly whatsappService: WhatsappService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { instance, data } = job.data;
    
    // Extraindo número real do remetente
    const key = data?.key;
    let rawJid = key?.remoteJid;
    if (rawJid?.includes('@lid') && key?.remoteJidAlt) {
      rawJid = key.remoteJidAlt;
    }
    if (!rawJid && data?.remoteJid) {
      rawJid = data.remoteJid;
    }

    const cleanNumber = (rawJid || '').split('@')[0].replace(/\D/g, '');
    const message = data?.message?.conversation || data?.message?.extendedTextMessage?.text || data?.text || '';
    
    // Ignorar se não for mensagem de texto válida, se for enviada por mim mesmo, etc.
    if (!message || key?.fromMe) {
      return;
    }

    console.log(`\n--------------------------------------------------`);
    console.log(`[Worker] 📩 Nova mensagem enfileirada para processamento`);
    console.log(`   Remetente: ${cleanNumber} (JID: ${rawJid})`);
    console.log(`   Instância: ${instance}`);
    console.log(`   Texto: "${message}"`);
    console.log(`--------------------------------------------------`);

    // 1. Identificar o negócio atrelado à instância
    const business = await this.prisma.business.findFirst({
      where: {
        OR: [
          { evolutionInstanceName: instance },
          { id: instance },
        ],
      },
    });

    if (!business) {
      console.error(`[Worker] ❌ Nenhum negócio atrelado à instância "${instance}".`);
      return;
    }

    console.log(`[Worker] 🏢 Negócio identificado: ${business.name || business.id} (${business.id})`);

    // 2. Localizar ou criar a conversa (Conversation)
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        businessId: business.id,
        OR: [
          { clientPhone: cleanNumber },
          { clientPhone: rawJid },
        ],
      },
    });

    if (!conversation) {
      console.log(`[Worker] 🆕 Criando nova conversa para ${cleanNumber} no negócio ${business.id}...`);
      conversation = await this.prisma.conversation.create({
        data: {
          businessId: business.id,
          clientPhone: cleanNumber,
          status: 'BOT',
        },
      });
    }

    // 3. Salvar a mensagem recebida do usuário (Message role: user)
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });
    console.log(`[Worker] 💾 Mensagem do cliente salva no banco (Conversation ID: ${conversation.id})`);

    // 4. Se a conversa estiver pausada em modo HUMAN, não envia para o robô
    if (conversation.status === 'HUMAN') {
      console.log(`[Worker] ⏸️ Conversa ${conversation.id} está em modo HUMAN. Atendimento pelo bot suspenso.`);
      return;
    }

    try {
      // 5. Dispara para o orquestrador Python (LangGraph) com o business.id real
      const pythonAgentUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';
      console.log(`[Worker] Enviando mensagem para o agente Python em ${pythonAgentUrl}/webhook...`);

      const response = await firstValueFrom(
        this.httpService.post(`${pythonAgentUrl}/webhook`, {
          tenant_id: business.id, 
          phone_number: cleanNumber,
          message: message,
        })
      );
      
      const { reply, intention, human_intervention_needed } = response.data;
      
      console.log(`[Worker] 🤖 Resposta recebida do Agente Python [${intention || 'INFO'}]: "${reply}"`);
      
      // 6. Se necessitar intervenção humana ou transbordo, atualiza o status da conversa
      if (human_intervention_needed || intention === 'HUMAN') {
        console.log(`[Worker] ⚠️ ALERTA: Intervenção humana necessária para ${cleanNumber}. Marcando conversa como HUMAN.`);
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'HUMAN' },
        });
      }

      // 7. Se o agente gerou uma resposta, salva no banco e envia no WhatsApp
      if (reply) {
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: reply,
          },
        });
        console.log(`[Worker] 💾 Resposta do assistente salva no banco.`);

        console.log(`[Worker] 📤 Enviando resposta de volta para o cliente ${cleanNumber}...`);
        await this.whatsappService.sendMessage(instance, cleanNumber, reply);
        console.log(`[Worker] ✅ Resposta entregue com sucesso ao cliente ${cleanNumber}!`);
      } else {
        console.log(`[Worker] ℹ️ Agente não gerou resposta de texto.`);
      }
      
    } catch (error) {
      console.error(`[Worker] ❌ Erro ao processar mensagem do ${cleanNumber}:`, error.message);
      throw error;
    }
  }
}

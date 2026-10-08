import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WhatsappService } from './whatsapp.service';

@Processor('whatsapp_messages')
export class WhatsappProcessor extends WorkerHost {
  constructor(
    private readonly httpService: HttpService,
    private readonly whatsappService: WhatsappService
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { instance, data } = job.data;
    
    // O payload do WhatsApp pode vir de diferentes formatos dependendo se é Evolution ou Z-API
    // Extraindo número do remetente e mensagem (simplificado)
    const phoneNumber = data?.key?.remoteJid?.split('@')[0] || data?.remoteJid?.split('@')[0];
    const message = data?.message?.conversation || data?.message?.extendedTextMessage?.text || data?.text || '';
    
    // Ignorar se não for mensagem de texto válida, se for enviada por mim mesmo, etc.
    if (!message || data?.key?.fromMe) return;

    console.log(`[Worker] Processando mensagem do ${phoneNumber}...`);

    try {
      // Dispara para o orquestrador Python (FastAPI que acabamos de criar)
      const pythonAgentUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';
      const response = await firstValueFrom(
        this.httpService.post(`${pythonAgentUrl}/webhook`, {
          tenant_id: instance, 
          phone_number: phoneNumber,
          message: message,
        })
      );
      
      const { reply, human_intervention_needed } = response.data;
      
      console.log(`[Worker] Resposta do Agente: ${reply}`);
      
      if (human_intervention_needed) {
        console.log(`[Worker] ALERTA: Intervenção humana necessária para ${phoneNumber}`);
        // Aqui poderia disparar o envio pro Telegram do dono do negócio
      }

      // Se o agente gerou uma resposta, enviamos de volta pro WhatsApp
      if (reply) {
        await this.whatsappService.sendMessage(instance, `${phoneNumber}@s.whatsapp.net`, reply);
      }
      
    } catch (error) {
      console.error(`[Worker] Erro ao processar mensagem do ${phoneNumber}:`, error.message);
      throw error;
    }
  }
}

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

    try {
      // Dispara para o orquestrador Python (FastAPI que acabamos de criar)
      const pythonAgentUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';
      console.log(`[Worker] Enviando mensagem para o agente Python em ${pythonAgentUrl}/webhook...`);

      const response = await firstValueFrom(
        this.httpService.post(`${pythonAgentUrl}/webhook`, {
          tenant_id: instance, 
          phone_number: cleanNumber,
          message: message,
        })
      );
      
      const { reply, human_intervention_needed } = response.data;
      
      console.log(`[Worker] 🤖 Resposta recebida do Agente Python: "${reply}"`);
      
      if (human_intervention_needed) {
        console.log(`[Worker] ⚠️ ALERTA: Intervenção humana necessária para ${cleanNumber}`);
      }

      // Se o agente gerou uma resposta, enviamos de volta pro WhatsApp
      if (reply) {
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

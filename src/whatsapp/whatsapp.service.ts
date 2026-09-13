import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class WhatsappService {
  constructor(
    private prisma: PrismaService,
    private chatService: ChatService
  ) {}

  private getEvoConfig() {
    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) {
      throw new Error('Credenciais do Evolution API não configuradas no .env.');
    }
    return { evoUrl, evoKey };
  }

  async getStatus(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Empresa não encontrada');

    if (!business.evolutionInstanceName) {
      return { connected: false, status: 'Não configurado' };
    }

    try {
      const { evoUrl, evoKey } = this.getEvoConfig();
      const response = await fetch(`${evoUrl}/instance/connectionState/${business.evolutionInstanceName}`, {
        headers: { apikey: evoKey }
      });
      if (response.ok) {
        const data = await response.json();
        return { 
          connected: data?.instance?.state === 'open',
          status: data?.instance?.state 
        };
      }
    } catch (e) {
      console.error('Erro ao verificar status:', e);
    }
    
    return { connected: false, status: 'Erro na verificação' };
  }

  async connect(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Empresa não encontrada');

    const { evoUrl, evoKey } = this.getEvoConfig();
    const instanceName = business.evolutionInstanceName || `bot-${businessId}`;

    // 1. Verifica se a instância já existe para tentar apenas conectar e pegar o QR Code novo
    if (business.evolutionInstanceName) {
      const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: evoKey }
      });
      
      if (connectRes.ok) {
        const connectData = await connectRes.json();
        if (connectData?.base64 || connectData?.qrcode) {
          return { 
            success: true, 
            qrcode: connectData?.base64 || connectData?.qrcode?.base64 || connectData?.qrcode 
          };
        }
      }
    }

    // 2. Se não existir ou falhar, cria a instância do zero
    const createRes = await fetch(`${evoUrl}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evoKey },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });

    const createData = await createRes.json();

    // 2. Salva o nome da instância no banco se for nova
    if (!business.evolutionInstanceName) {
      await this.prisma.business.update({
        where: { id: businessId },
        data: { evolutionInstanceName: instanceName },
      });
    }

    // 3. Configura o Webhook
    await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evoKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: 'http://host.docker.internal:3001/whatsapp/webhook',
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT'],
        }
      }),
    });

    return { 
      success: true, 
      qrcode: createData?.qrcode?.base64 || createData?.qrcode 
    };
  }

  async disconnect(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business || !business.evolutionInstanceName) {
      return { success: true };
    }

    const { evoUrl, evoKey } = this.getEvoConfig();
    const instanceName = business.evolutionInstanceName;

    try {
      // 1. Faz logout
      await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: evoKey }
      });
      // 2. Deleta a instância
      await fetch(`${evoUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: evoKey }
      });
    } catch (e) {
      console.error('Erro ao deletar instância na API:', e);
    }

    // 3. Remove do banco
    await this.prisma.business.update({
      where: { id: businessId },
      data: { evolutionInstanceName: null },
    });

    return { success: true };
  }

  async processMessage(instanceName: string, data: any) {
    try {
      const message = data?.message;
      if (!message) return;

      const key = data?.key;
      if (!key || key.fromMe) return;

      const remoteJid = key.remoteJid;
      if (!remoteJid) return;
      
      const text = message.conversation || message.extendedTextMessage?.text;
      if (!text) return; 

      // Pega o negócio usando a instância dinâmica em vez de findFirst
      const business = await this.prisma.business.findUnique({
        where: { evolutionInstanceName: instanceName }
      });

      if (!business) {
        console.error(`Nenhum negócio atrelado à instância ${instanceName}.`);
        return;
      }

      let conversation = await this.prisma.conversation.findFirst({
        where: { businessId: business.id, clientPhone: remoteJid },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { businessId: business.id, clientPhone: remoteJid, status: 'BOT' },
        });
      }

      await this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content: text },
      });

      if (conversation.status === 'HUMAN') return;

      const aiResult = await this.chatService.processMessage(business.id, conversation.id, text);
      const answer = aiResult.answer;

      await this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'assistant', content: answer },
      });

      if (aiResult.fallback) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'HUMAN' },
        });
      }

      if (aiResult.extractedData && aiResult.extractedData.isComplete) {
        try {
          const serviceName = aiResult.extractedData.service || '';
          const service = await this.prisma.service.findFirst({
            where: { businessId: business.id, name: { contains: serviceName, mode: 'insensitive' } }
          });
          
          if (service) {
            let appointmentDate = new Date();
            if (aiResult.extractedData.date) {
              const parsedDate = new Date(aiResult.extractedData.date);
              if (!isNaN(parsedDate.getTime())) {
                appointmentDate = parsedDate;
              }
            }
            const clientName = aiResult.extractedData.name || 'Cliente';
            await this.prisma.appointment.create({
              data: {
                businessId: business.id,
                clientPhone: remoteJid,
                clientName: clientName,
                serviceId: service.id,
                date: appointmentDate,
                status: 'PENDING'
              }
            });

            if (business.ownerPhone && business.evolutionInstanceName) {
              const { evoUrl, evoKey } = this.getEvoConfig();
              const dateStr = appointmentDate.toLocaleString('pt-BR');
              const notificationText = `🚨 *Novo Agendamento Recebido!*\n\n👤 Cliente: ${clientName} (${remoteJid.replace('@s.whatsapp.net', '')})\n💆 Serviço: ${service.name}\n📅 Data: ${dateStr}\n\nAcesse o painel do Klinik OS para confirmar ou alterar!`;
              
              fetch(`${evoUrl}/message/sendText/${business.evolutionInstanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: evoKey },
                body: JSON.stringify({
                  number: business.ownerPhone,
                  options: { delay: 1200, presence: 'composing' },
                  text: notificationText,
                }),
              }).catch(err => console.error('Erro ao notificar proprietário:', err));
            }
          }
        } catch (err) {
          console.error("Erro ao salvar agendamento:", err);
        }
      }

      const { evoUrl, evoKey } = this.getEvoConfig();
      
      try {
        await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoKey },
          body: JSON.stringify({
            number: remoteJid,
            options: { delay: 1200, presence: 'composing' },
            text: answer,
          }),
        });
      } catch (err) {
        console.error('Falha ao enviar requisição HTTP para o Evolution API:', err);
      }
    } catch (error) {
      console.error('Erro ao processar mensagem do Evolution API:', error);
    }
  }
}

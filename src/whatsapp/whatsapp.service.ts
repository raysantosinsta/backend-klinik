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
    console.log(`[connect] Buscando empresa ${businessId}...`);
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      console.error('[connect] Empresa não encontrada');
      throw new NotFoundException('Empresa não encontrada');
    }

    const { evoUrl, evoKey } = this.getEvoConfig();
    const instanceName = business.evolutionInstanceName || `bot-${businessId}`;
    console.log(`[connect] Instância: ${instanceName} | evolutionInstanceName atual: ${business.evolutionInstanceName}`);

    // 1. Verifica se a instância já existe para tentar apenas conectar e pegar o QR Code novo
    if (business.evolutionInstanceName) {
      console.log(`[connect] Instância já existe. Buscando QR Code...`);
      const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: evoKey }
      });
      
      console.log(`[connect] Status da resposta de connect: ${connectRes.status}`);
      if (connectRes.ok) {
        const connectData = await connectRes.json();
        console.log(`[connect] Resposta recebida da API:`, JSON.stringify(connectData).substring(0, 100) + '...');
        if (connectData?.base64 || connectData?.qrcode) {
          console.log(`[connect] QR Code encontrado na resposta.`);
          return { 
            success: true, 
            qrcode: connectData?.base64 || connectData?.qrcode?.base64 || connectData?.qrcode 
          };
        } else {
          console.log(`[connect] QR Code NÃO encontrado na resposta.`);
        }
      } else {
        const errText = await connectRes.text();
        console.error(`[connect] Falha ao tentar conectar: ${errText}`);
      }
    }

    // 2. Se não existir ou falhar, cria a instância do zero
    console.log(`[connect] Criando instância do zero...`);
    const createRes = await fetch(`${evoUrl}/instance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evoKey },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });

    console.log(`[connect] Status da criação da instância: ${createRes.status}`);
    const createData = await createRes.json();
    console.log(`[connect] Dados da criação:`, JSON.stringify(createData).substring(0, 100) + '...');

    // 2. Salva o nome da instância no banco se for nova
    if (!business.evolutionInstanceName) {
      console.log(`[connect] Salvando evolutionInstanceName no banco...`);
      await this.prisma.business.update({
        where: { id: businessId },
        data: { evolutionInstanceName: instanceName },
      });
    }

    // 3. Configura o Webhook
    console.log(`[connect] Configurando Webhook para a instância...`);
    const baseUrl = process.env.WEBHOOK_URL || 'http://host.docker.internal:3001';
    const webhookUrl = `${baseUrl}/whatsapp/webhook`;
    
    console.log(`[connect] URL do Webhook será: ${webhookUrl}`);
    const webhookRes = await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evoKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT'],
        }
      }),
    });
    console.log(`[connect] Status da configuração do Webhook: ${webhookRes.status}`);
    if (!webhookRes.ok) {
      const wErr = await webhookRes.text();
      console.error(`[connect] Erro ao configurar Webhook: ${wErr}`);
    }

    console.log(`[connect] Conexão/Criação finalizada com sucesso.`);
    return { 
      success: true, 
      qrcode: createData?.qrcode?.base64 || createData?.qrcode 
    };
  }

  async disconnect(businessId: string) {
    console.log(`\n[disconnect] Buscando empresa ${businessId}...`);
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business || !business.evolutionInstanceName) {
      console.log(`[disconnect] Empresa não encontrada ou não possui evolutionInstanceName.`);
      return { success: true };
    }

    const { evoUrl, evoKey } = this.getEvoConfig();
    const instanceName = business.evolutionInstanceName;
    console.log(`[disconnect] Iniciando desconexão da instância: ${instanceName}`);

    try {
      // 1. Faz logout
      console.log(`[disconnect] Fazendo logout...`);
      const logoutRes = await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: evoKey }
      });
      console.log(`[disconnect] Logout status: ${logoutRes.status}`);

      // 2. Deleta a instância
      console.log(`[disconnect] Deletando instância...`);
      const delRes = await fetch(`${evoUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: evoKey }
      });
      console.log(`[disconnect] Delete status: ${delRes.status}`);
    } catch (e) {
      console.error('[disconnect] Erro ao deletar instância na API:', e);
    }

    // 3. Remove do banco
    console.log(`[disconnect] Removendo evolutionInstanceName do banco...`);
    await this.prisma.business.update({
      where: { id: businessId },
      data: { evolutionInstanceName: null },
    });

    console.log(`[disconnect] Desconexão concluída com sucesso.`);
    return { success: true };
  }

  async processMessage(instanceName: string, data: any) {
    console.log('\n--- INICIANDO PROCESSAMENTO DE MENSAGEM ---');
    console.log('InstanceName:', instanceName);
    try {
      const message = data?.message;
      if (!message) {
        console.log('⚠️ Nenhuma mensagem encontrada no data.');
        return;
      }

      const key = data?.key;
      if (!key || key.fromMe) {
        console.log('⚠️ Mensagem enviada por mim mesmo ou key não encontrada. Ignorando.');
        return;
      }

      // O WhatsApp e a Evolution API v2 às vezes enviam o ID em remoteJidAlt quando remoteJid é um @lid
      const remoteJid = (key.remoteJid?.includes('@lid') && key.remoteJidAlt) 
                        ? key.remoteJidAlt 
                        : key.remoteJid;

      if (!remoteJid) {
        console.log('⚠️ remoteJid não encontrado.');
        return;
      }
      
      const text = message.conversation || message.extendedTextMessage?.text;
      if (!text) {
        console.log('⚠️ Texto não encontrado na mensagem.');
        console.log('Conteúdo da mensagem:', JSON.stringify(message, null, 2));
        return; 
      }

      console.log(`✅ Mensagem recebida de ${remoteJid}: "${text}"`);

      // Pega o negócio usando a instância dinâmica em vez de findFirst
      const business = await this.prisma.business.findUnique({
        where: { evolutionInstanceName: instanceName }
      });

      if (!business) {
        console.error(`❌ Nenhum negócio atrelado à instância ${instanceName}.`);
        return;
      }

      console.log(`🏢 Negócio encontrado: ${business.id}`);

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

      if (conversation.status === 'HUMAN') {
        console.log('⏸️ Conversa em modo HUMAN, bot não vai responder.');
        return;
      }

      console.log('🤖 Processando com a IA...');
      const aiResult = await this.chatService.processMessage(business.id, conversation.id, text);
      const answer = aiResult.answer;
      console.log(`🤖 Resposta da IA gerada: "${answer}"`);

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

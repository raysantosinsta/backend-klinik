import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    console.log('\n=== WEBHOOK RECEBIDO ===');
    console.log('Event:', payload?.event);
    console.log('Instance:', payload?.instance);
    
    if (payload?.event === 'messages.upsert' || payload?.event === 'MESSAGES_UPSERT') {
      await this.whatsappService.processMessage(payload.instance, payload.data);
    } else if (payload?.event === 'messages.upsert') {
      // Caso seja minúsculo, mantemos para compatibilidade
      await this.whatsappService.processMessage(payload.instance, payload.data);
    } else {
      console.log('Evento ignorado:', payload?.event);
    }
    return { success: true };
  }

  @Get('status/:businessId')
  async getStatus(@Param('businessId') businessId: string) {
    return this.whatsappService.getStatus(businessId);
  }

  @Post('connect/:businessId')
  async connect(@Param('businessId') businessId: string) {
    console.log(`\n=== INICIANDO CONEXÃO (businessId: ${businessId}) ===`);
    return this.whatsappService.connect(businessId);
  }

  @Delete('disconnect/:businessId')
  async disconnect(@Param('businessId') businessId: string) {
    console.log(`\n=== INICIANDO DESCONEXÃO (businessId: ${businessId}) ===`);
    return this.whatsappService.disconnect(businessId);
  }
}

import { Controller, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    console.log('Webhook Evolution API recebido:', JSON.stringify(payload, null, 2));
    
    // O Evolution API dispara vários eventos, queremos o 'messages.upsert'
    if (payload?.event === 'messages.upsert') {
      await this.whatsappService.processMessage(payload.data);
    }
    
    return { success: true };
  }
}

import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    if (payload?.event === 'messages.upsert') {
      await this.whatsappService.processMessage(payload.instance, payload.data);
    }
    return { success: true };
  }

  @Get('status/:businessId')
  async getStatus(@Param('businessId') businessId: string) {
    return this.whatsappService.getStatus(businessId);
  }

  @Post('connect/:businessId')
  async connect(@Param('businessId') businessId: string) {
    return this.whatsappService.connect(businessId);
  }

  @Delete('disconnect/:businessId')
  async disconnect(@Param('businessId') businessId: string) {
    return this.whatsappService.disconnect(businessId);
  }
}

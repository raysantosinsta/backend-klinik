import { Injectable, Logger } from '@nestjs/common';

export interface WebhookResult {
  sent: boolean;
  status?: number;
  error?: string;
  reason?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  async dispatchGoogleSheetsWebhook(payload: Record<string, any>): Promise<WebhookResult> {
    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

    if (!webhookUrl) {
      this.logger.warn('⚠️ GOOGLE_SHEETS_WEBHOOK_URL não configurado no .env. Pulando disparo de webhook.');
      return { sent: false, reason: 'URL not configured' };
    }

    this.logger.log(`📤 [Webhook Google Sheets] Disparando evento para: ${webhookUrl}`);
    this.logger.log(`   Payload: ${JSON.stringify(payload)}`);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`❌ Erro no webhook do Google Sheets: Status ${response.status} - ${errorText}`);
        return { sent: false, status: response.status, error: errorText };
      }

      this.logger.log(`✅ [Webhook Google Sheets] Dados enviados com sucesso! Status: ${response.status}`);
      return { sent: true, status: response.status };
    } catch (error: any) {
      this.logger.error(`❌ Falha na requisição HTTP para o webhook do Google Sheets: ${error.message}`);
      return { sent: false, error: error.message };
    }
  }
}

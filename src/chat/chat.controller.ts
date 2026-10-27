import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async processMessage(@Body() body: { businessId: string; message: string }) {
    return this.chatService.processMessage(body.businessId, null, body.message);
  }

  @Post('multiagent')
  async processMultiAgent(@Body() body: { businessId: string; message: string; phone?: string }) {
    const pythonAgentUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';
    try {
      const res = await fetch(`${pythonAgentUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: body.businessId,
          phone_number: body.phone || 'web-tester',
          message: body.message,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
      const errText = await res.text();
      return {
        status: 'error',
        reply: `Erro da API Python (${res.status}): ${errText}`,
        intention: 'HUMAN',
        human_intervention_needed: true,
      };
    } catch (e: any) {
      return {
        status: 'error',
        reply: `Não foi possível conectar ao agente Python (${pythonAgentUrl}): ${e.message}`,
        intention: 'HUMAN',
        human_intervention_needed: true,
      };
    }
  }

  @Post('context')
  async getContext(@Body() body: { businessId: string; query: string }) {
    return this.chatService.getContext(body.businessId, body.query);
  }
}

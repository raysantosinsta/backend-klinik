import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhooksService],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    delete process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip sending if GOOGLE_SHEETS_WEBHOOK_URL is not defined', async () => {
    delete process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    const result = await service.dispatchGoogleSheetsWebhook({ test: true });

    expect(result).toEqual({ sent: false, reason: 'URL not configured' });
  });

  it('should send webhook when GOOGLE_SHEETS_WEBHOOK_URL is configured', async () => {
    process.env.GOOGLE_SHEETS_WEBHOOK_URL = 'https://mock.webhook.test/exec';
    
    // Mock global fetch
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('Success'),
    });
    global.fetch = mockFetch;

    const payload = {
      event: 'appointment.confirmed',
      id: 'app-1',
      clientName: 'Maria',
      serviceName: 'Botox',
    };

    const result = await service.dispatchGoogleSheetsWebhook(payload);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mock.webhook.test/exec',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
    expect(result).toEqual({ sent: true, status: 200 });
  });

  it('should catch error and return sent: false if fetch throws', async () => {
    process.env.GOOGLE_SHEETS_WEBHOOK_URL = 'https://mock.webhook.test/exec';
    
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await service.dispatchGoogleSheetsWebhook({ test: true });

    expect(result).toEqual({ sent: false, error: 'Network error' });
  });
});

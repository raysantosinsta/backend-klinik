import { Test, TestingModule } from '@nestjs/testing';

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => jest.fn(),
  WorkerHost: class WorkerHost {},
}));

jest.mock('@nestjs/axios', () => ({
  HttpService: class HttpService {
    post = jest.fn();
  },
}));

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

import { WhatsappProcessor } from './whatsapp.processor';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { Job } from 'bullmq';

describe('WhatsappProcessor', () => {
  let processor: WhatsappProcessor;
  let httpService: HttpService;
  let whatsappService: WhatsappService;
  let prisma: PrismaService;

  const mockPrismaService = {
    business: {
      findFirst: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
  };

  const mockWhatsappService = {
    sendMessage: jest.fn(),
  };

  const mockHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappProcessor,
        { provide: HttpService, useValue: mockHttpService },
        { provide: WhatsappService, useValue: mockWhatsappService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    processor = module.get<WhatsappProcessor>(WhatsappProcessor);
    httpService = module.get<HttpService>(HttpService);
    whatsappService = module.get<WhatsappService>(WhatsappService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should ignore message if fromMe is true', async () => {
    const job = {
      data: {
        instance: 'bot-1',
        data: {
          key: { fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' },
          message: { conversation: 'Olá' },
        },
      },
    } as unknown as Job;

    await processor.process(job);

    expect(mockPrismaService.business.findFirst).not.toHaveBeenCalled();
    expect(mockHttpService.post).not.toHaveBeenCalled();
  });

  it('should ignore message if text is empty', async () => {
    const job = {
      data: {
        instance: 'bot-1',
        data: {
          key: { fromMe: false, remoteJid: '5511999999999@s.whatsapp.net' },
          message: {},
        },
      },
    } as unknown as Job;

    await processor.process(job);

    expect(mockPrismaService.business.findFirst).not.toHaveBeenCalled();
    expect(mockHttpService.post).not.toHaveBeenCalled();
  });

  it('should save user message, call python agent, save assistant message, and send response', async () => {
    const mockBusiness = { id: 'biz-123', name: 'Clínica Sorriso', evolutionInstanceName: 'bot-1' };
    const mockConversation = { id: 'conv-456', businessId: 'biz-123', clientPhone: '5511999999999', status: 'BOT' };

    mockPrismaService.business.findFirst.mockResolvedValue(mockBusiness);
    mockPrismaService.conversation.findFirst.mockResolvedValue(mockConversation);
    mockPrismaService.message.create.mockResolvedValue({ id: 'msg-1' });

    mockHttpService.post.mockReturnValue(of({
      data: {
        status: 'success',
        reply: 'Olá! Como posso ajudar?',
        intention: 'DUVIDAS',
        human_intervention_needed: false,
      },
    }));

    const job = {
      data: {
        instance: 'bot-1',
        data: {
          key: { fromMe: false, remoteJid: '5511999999999@s.whatsapp.net' },
          message: { conversation: 'Qual o horário?' },
        },
      },
    } as unknown as Job;

    await processor.process(job);

    // Deve buscar o negócio atrelado
    expect(mockPrismaService.business.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { evolutionInstanceName: 'bot-1' },
          { id: 'bot-1' },
        ],
      },
    });

    // Deve buscar a conversa existente
    expect(mockPrismaService.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: 'biz-123',
        OR: [
          { clientPhone: '5511999999999' },
          { clientPhone: '5511999999999@s.whatsapp.net' },
        ],
      },
    });

    // Deve salvar a mensagem do usuário
    expect(mockPrismaService.message.create).toHaveBeenNthCalledWith(1, {
      data: {
        conversationId: 'conv-456',
        role: 'user',
        content: 'Qual o horário?',
      },
    });

    // Deve chamar o agente Python com o tenant_id sendo o ID do business
    expect(mockHttpService.post).toHaveBeenCalledWith(
      expect.stringContaining('/webhook'),
      {
        tenant_id: 'biz-123',
        phone_number: '5511999999999',
        message: 'Qual o horário?',
      }
    );

    // Deve salvar a resposta do assistente
    expect(mockPrismaService.message.create).toHaveBeenNthCalledWith(2, {
      data: {
        conversationId: 'conv-456',
        role: 'assistant',
        content: 'Olá! Como posso ajudar?',
      },
    });

    // Deve enviar mensagem de volta pelo WhatsApp
    expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith('bot-1', '5511999999999', 'Olá! Como posso ajudar?');
  });

  it('should create conversation if not found', async () => {
    const mockBusiness = { id: 'biz-123', name: 'Clínica Sorriso', evolutionInstanceName: 'bot-1' };
    const mockNewConversation = { id: 'conv-new', businessId: 'biz-123', clientPhone: '5511999999999', status: 'BOT' };

    mockPrismaService.business.findFirst.mockResolvedValue(mockBusiness);
    mockPrismaService.conversation.findFirst.mockResolvedValue(null);
    mockPrismaService.conversation.create.mockResolvedValue(mockNewConversation);
    mockPrismaService.message.create.mockResolvedValue({ id: 'msg-1' });

    mockHttpService.post.mockReturnValue(of({
      data: {
        status: 'success',
        reply: 'Bem-vindo!',
        intention: 'DUVIDAS',
        human_intervention_needed: false,
      },
    }));

    const job = {
      data: {
        instance: 'bot-1',
        data: {
          key: { fromMe: false, remoteJid: '5511999999999@s.whatsapp.net' },
          message: { conversation: 'Olá' },
        },
      },
    } as unknown as Job;

    await processor.process(job);

    expect(mockPrismaService.conversation.create).toHaveBeenCalledWith({
      data: {
        businessId: 'biz-123',
        clientPhone: '5511999999999',
        status: 'BOT',
      },
    });
  });

  it('should not call python agent if conversation is in HUMAN mode', async () => {
    const mockBusiness = { id: 'biz-123', evolutionInstanceName: 'bot-1' };
    const mockConversation = { id: 'conv-456', businessId: 'biz-123', clientPhone: '5511999999999', status: 'HUMAN' };

    mockPrismaService.business.findFirst.mockResolvedValue(mockBusiness);
    mockPrismaService.conversation.findFirst.mockResolvedValue(mockConversation);

    const job = {
      data: {
        instance: 'bot-1',
        data: {
          key: { fromMe: false, remoteJid: '5511999999999@s.whatsapp.net' },
          message: { conversation: 'Preciso falar com uma pessoa' },
        },
      },
    } as unknown as Job;

    await processor.process(job);

    // Salva a mensagem do usuário
    expect(mockPrismaService.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-456',
        role: 'user',
        content: 'Preciso falar com uma pessoa',
      },
    });

    // Não deve chamar Python nem enviar mensagem de bot
    expect(mockHttpService.post).not.toHaveBeenCalled();
    expect(mockWhatsappService.sendMessage).not.toHaveBeenCalled();
  });

  it('should update conversation status to HUMAN if agent flags human_intervention_needed', async () => {
    const mockBusiness = { id: 'biz-123', evolutionInstanceName: 'bot-1' };
    const mockConversation = { id: 'conv-456', businessId: 'biz-123', clientPhone: '5511999999999', status: 'BOT' };

    mockPrismaService.business.findFirst.mockResolvedValue(mockBusiness);
    mockPrismaService.conversation.findFirst.mockResolvedValue(mockConversation);

    mockHttpService.post.mockReturnValue(of({
      data: {
        status: 'success',
        reply: 'Transferindo para um atendente humano...',
        intention: 'HUMAN',
        human_intervention_needed: true,
      },
    }));

    const job = {
      data: {
        instance: 'bot-1',
        data: {
          key: { fromMe: false, remoteJid: '5511999999999@s.whatsapp.net' },
          message: { conversation: 'Quero cancelar meu contrato urgente' },
        },
      },
    } as unknown as Job;

    await processor.process(job);

    expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-456' },
      data: { status: 'HUMAN' },
    });

    expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith('bot-1', '5511999999999', 'Transferindo para um atendente humano...');
  });
});

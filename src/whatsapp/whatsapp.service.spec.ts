import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { NotFoundException } from '@nestjs/common';

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn()
}));

// Mock do global fetch
global.fetch = jest.fn();

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: PrismaService;
  let chatService: ChatService;

  const mockPrismaService = {
    business: {
      findUnique: jest.fn(),
      update: jest.fn(),
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

  const mockChatService = {
    processMessage: jest.fn(),
  };

  beforeEach(async () => {
    // Configura variáveis de ambiente necessárias
    process.env.EVOLUTION_API_URL = 'http://localhost:8080';
    process.env.EVOLUTION_API_KEY = 'secret';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    prisma = module.get<PrismaService>(PrismaService);
    chatService = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStatus', () => {
    it('should throw NotFoundException if business not found', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue(null);
      await expect(service.getStatus('biz-1')).rejects.toThrow(NotFoundException);
    });

    it('should return connected:false if evolutionInstanceName is null', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue({ id: 'biz-1', evolutionInstanceName: null });
      const result = await service.getStatus('biz-1');
      expect(result).toEqual({ connected: false, status: 'Não configurado' });
    });

    it('should call fetch and return connected:true if API returns state open', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue({ id: 'biz-1', evolutionInstanceName: 'bot-1' });
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const result = await service.getStatus('biz-1');
      
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/instance/connectionState/bot-1', expect.any(Object));
      expect(result).toEqual({ connected: true, status: 'open' });
    });
  });

  describe('connect', () => {
    it('should create instance and update db', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue({ id: 'biz-1', evolutionInstanceName: null });
      
      // Fetch create
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ qrcode: { base64: 'mock-base64' } }) })
        // Fetch webhook set
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const result = await service.connect('biz-1');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.business.update).toHaveBeenCalledWith({
        where: { id: 'biz-1' },
        data: { evolutionInstanceName: 'bot-biz-1' }
      });
      expect(result).toEqual({ success: true, qrcode: 'mock-base64' });
    });
  });

  describe('disconnect', () => {
    it('should logout, delete instance and update db', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue({ id: 'biz-1', evolutionInstanceName: 'bot-1' });
      
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const result = await service.disconnect('biz-1');

      expect(global.fetch).toHaveBeenCalledTimes(2); // logout and delete
      expect(mockPrismaService.business.update).toHaveBeenCalledWith({
        where: { id: 'biz-1' },
        data: { evolutionInstanceName: null }
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('processMessage', () => {
    it('should ignore if message is from bot (fromMe=true)', async () => {
      await service.processMessage('bot-1', { key: { fromMe: true }, message: { conversation: 'test' } });
      expect(mockPrismaService.business.findUnique).not.toHaveBeenCalled();
    });

    it('should process text, call chatService and send answer via fetch', async () => {
      const mockBusiness = { id: 'biz-1', evolutionInstanceName: 'bot-1' };
      const mockConversation = { id: 'conv-1', status: 'BOT' };
      
      mockPrismaService.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrismaService.conversation.findFirst.mockResolvedValue(mockConversation);
      mockChatService.processMessage.mockResolvedValue({ answer: 'Hello', fallback: false });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await service.processMessage('bot-1', {
        key: { fromMe: false, remoteJid: '123@s.whatsapp.net' },
        message: { conversation: 'Ola' }
      });

      expect(mockPrismaService.message.create).toHaveBeenCalledTimes(2); // user msg and assistant msg
      expect(mockChatService.processMessage).toHaveBeenCalledWith('biz-1', 'conv-1', 'Ola');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/message/sendText/bot-1', expect.any(Object));
    });
  });
});

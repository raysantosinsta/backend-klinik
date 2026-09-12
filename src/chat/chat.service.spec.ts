import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

// Mocking dependencies
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue(
    jest.fn().mockResolvedValue({
      data: new Float32Array(384).fill(0.1) // Simula 384 dimensões do MiniLM
    })
  )
}));

jest.mock('@langchain/groq', () => {
  return {
    ChatGroq: jest.fn().mockImplementation(() => ({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn().mockResolvedValue({
          answer: 'Resposta mockada pela IA',
          needsHumanFallback: false
        })
      })
    }))
  };
});

describe('ChatService', () => {
  let service: ChatService;
  let prisma: PrismaService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processMessage', () => {
    it('should return fallback true if no context chunks are found', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]); // Nenhum chunk achado

      const result = await service.processMessage('biz-1', 'Ola');

      expect(result.fallback).toBe(true);
      expect(result.answer).toContain('não encontrei informações');
    });

    it('should return AI answer and fallback false if context exists', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        { content: 'Chunk 1', similarity: 0.9 },
        { content: 'Chunk 2', similarity: 0.8 }
      ]);

      const result = await service.processMessage('biz-1', 'Ola');

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(result.fallback).toBe(false);
      expect(result.answer).toBe('Resposta mockada pela IA');
    });

    it('should return fallback if AI explicitly needs human fallback', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ content: 'Context', similarity: 0.9 }]);

      // Força a IA a pedir fallback localmente
      const { ChatGroq } = require('@langchain/groq');
      ChatGroq.mockImplementationOnce(() => ({
        withStructuredOutput: jest.fn().mockReturnValue({
          invoke: jest.fn().mockResolvedValue({ answer: '', needsHumanFallback: true })
        })
      }));

      const result = await service.processMessage('biz-1', 'Quanto custa a Ferrari?');

      expect(result.fallback).toBe(true);
      expect(result.answer).toContain('Gostaria de falar com um atendente humano');
    });

    it('should return error response and fallback if LLM invocation fails', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ content: 'Context', similarity: 0.9 }]);

      const { ChatGroq } = require('@langchain/groq');
      ChatGroq.mockImplementationOnce(() => ({
        withStructuredOutput: jest.fn().mockReturnValue({
          invoke: jest.fn().mockRejectedValue(new Error('API Down'))
        })
      }));

      const result = await service.processMessage('biz-1', 'Ola');

      expect(result.fallback).toBe(true);
      expect(result.answer).toContain('Ocorreu um erro interno');
    });
  });
});

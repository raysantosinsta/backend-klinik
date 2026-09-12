import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';

// Mock dependências externas
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://mock-url/file.pdf' } }),
      }),
    },
  }),
}));

jest.mock('@langchain/community/document_loaders/fs/pdf', () => ({
  PDFLoader: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue([{ pageContent: 'Mocked PDF Content' }]),
  })),
}));

jest.mock('@langchain/textsplitters', () => ({
  RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
    splitDocuments: jest.fn().mockResolvedValue([{ pageContent: 'Mocked Chunk Content' }]),
  })),
}));

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue(
    jest.fn().mockResolvedValue({
      data: new Float32Array(384).fill(0.5)
    })
  )
}));

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    document: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };

  beforeEach(async () => {
    // Definir variáveis de ambiente para o mock do createClient funcionar
    process.env.SUPABASE_URL = 'http://mock-url';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('should upload a file, create document and generate vectors', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('mock pdf binary content'),
      } as Express.Multer.File;

      const mockDocument = {
        id: 'doc-1',
        filename: 'test.pdf',
        storageUrl: 'http://mock-url/file.pdf',
        businessId: 'biz-1',
      };

      mockPrismaService.document.create.mockResolvedValue(mockDocument);

      const result = await service.upload(mockFile, 'biz-1');

      expect(mockPrismaService.document.create).toHaveBeenCalledWith({
        data: {
          filename: 'test.pdf',
          storageUrl: 'http://mock-url/file.pdf',
          businessId: 'biz-1',
        },
      });

      // Valida se o insert no banco vetorial foi chamado para os chunks mockados
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
      expect(result).toEqual(mockDocument);
    });

    it('should throw an error if supabase upload fails', async () => {
      const { createClient } = require('@supabase/supabase-js');
      createClient.mockReturnValueOnce({
        storage: {
          from: jest.fn().mockReturnValue({
            upload: jest.fn().mockResolvedValue({ data: null, error: { message: 'Upload falhou' } }),
          }),
        },
      });

      const mockFile = { originalname: 'test.pdf' } as Express.Multer.File;

      // Importante: No teste de exceção, precisamos recriar o serviço para aplicar o mock alterado, 
      // ou apenas testar com o mock alterado no teste se a injeção for dinâmica. Como o createClient
      // roda no construtor do service, precisamos re-instanciar.
      const testService = new DocumentsService(prisma as any);

      await expect(testService.upload(mockFile, 'biz-1')).rejects.toThrow('Falha no upload para o Supabase: Upload falhou');
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });
  });
});

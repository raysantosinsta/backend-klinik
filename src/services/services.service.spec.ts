import { Test, TestingModule } from '@nestjs/testing';
import { ServicesService } from './services.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  service: {
    create: jest.fn().mockImplementation((dto) => {
      return Promise.resolve({
        id: '123e4567-e89b-12d3-a456-426614174000',
        ...dto.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

describe('ServicesService', () => {
  let service: ServicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a service', async () => {
    const dto = {
      name: 'Consulta Geral',
      description: 'Consulta médica',
      durationInMinutes: 30,
      price: 150.0,
      businessId: 'bus-123',
    };

    const result = await service.create(dto);
    expect(result).toEqual(
      expect.objectContaining({
        name: 'Consulta Geral',
        price: 150.0,
      }),
    );
    expect(mockPrismaService.service.create).toHaveBeenCalledWith({
      data: dto,
    });
  });
});

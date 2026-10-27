import { Test, TestingModule } from '@nestjs/testing';
import { BusinessService } from './business.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('BusinessService', () => {
  let service: BusinessService;
  let prisma: PrismaService;

  const mockPrisma = {
    business: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<BusinessService>(BusinessService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateGoogleSheetsId', () => {
    it('should throw NotFoundException if business not found', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(null);
      await expect(service.updateGoogleSheetsId('b-1', 'sheet-123')).rejects.toThrow(NotFoundException);
    });

    it('should update googleSheetsId if business exists', async () => {
      mockPrisma.business.findUnique.mockResolvedValue({ id: 'b-1' });
      mockPrisma.business.update.mockResolvedValue({ id: 'b-1', googleSheetsId: 'sheet-123' });

      const result = await service.updateGoogleSheetsId('b-1', 'sheet-123');
      expect(result.googleSheetsId).toBe('sheet-123');
      expect(mockPrisma.business.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: { googleSheetsId: 'sheet-123' },
      });
    });
  });

  describe('updateOwnerPhone', () => {
    it('should throw NotFoundException if business not found', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(null);
      await expect(service.updateOwnerPhone('b-1', '5511999999999')).rejects.toThrow(NotFoundException);
    });

    it('should update ownerPhone if business exists', async () => {
      mockPrisma.business.findUnique.mockResolvedValue({ id: 'b-1' });
      mockPrisma.business.update.mockResolvedValue({ id: 'b-1', ownerPhone: '5511999999999' });

      const result = await service.updateOwnerPhone('b-1', '5511999999999');
      expect(result.ownerPhone).toBe('5511999999999');
    });
  });
});

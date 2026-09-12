import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    business: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerUser', () => {
    it('should throw ConflictException if user already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: '123' });

      await expect(
        service.registerUser('123', 'test@test.com', 'Test', 'Business')
      ).rejects.toThrow(ConflictException);
      
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should create business and user if email is unique', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      
      const mockBusiness = { id: 'biz-1', name: 'Business' };
      const mockUser = { id: '123', email: 'test@test.com', name: 'Test', businessId: 'biz-1' };
      
      // Simulate transaction behavior
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          business: { create: jest.fn().mockResolvedValue(mockBusiness) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
        };
        return callback(tx);
      });

      const result = await service.registerUser('123', 'test@test.com', 'Test', 'Business');

      expect(result).toEqual({ user: mockUser, business: mockBusiness });
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('getUserProfile', () => {
    it('should throw NotFoundException if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserProfile('123')).rejects.toThrow(NotFoundException);
    });

    it('should return user with business if found', async () => {
      const mockUser = { id: '123', name: 'Test', business: { id: 'biz-1' } };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserProfile('123');
      expect(result).toEqual(mockUser);
    });
  });
});

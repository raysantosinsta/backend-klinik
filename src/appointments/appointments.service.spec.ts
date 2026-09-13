import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    appointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return appointments for a business', async () => {
      const mockAppointments = [{ id: '1', clientName: 'John' }];
      mockPrismaService.appointment.findMany.mockResolvedValue(mockAppointments);

      const result = await service.findAll('biz-1');

      expect(mockPrismaService.appointment.findMany).toHaveBeenCalledWith({
        where: { businessId: 'biz-1' },
        include: { service: true },
        orderBy: { date: 'desc' },
      });
      expect(result).toEqual(mockAppointments);
    });
  });

  describe('updateStatus', () => {
    it('should throw NotFoundException if appointment does not exist', async () => {
      mockPrismaService.appointment.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('1', 'CONFIRMED')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update appointment status', async () => {
      const mockAppointment = { id: '1', status: 'PENDING' };
      const updatedAppointment = { id: '1', status: 'CONFIRMED' };

      mockPrismaService.appointment.findUnique.mockResolvedValue(mockAppointment);
      mockPrismaService.appointment.update.mockResolvedValue(updatedAppointment);

      const result = await service.updateStatus('1', 'CONFIRMED');

      expect(mockPrismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { status: 'CONFIRMED' },
      });
      expect(result).toEqual(updatedAppointment);
    });
  });
});

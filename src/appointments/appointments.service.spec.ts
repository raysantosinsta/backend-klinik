import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;
  let webhooksService: WebhooksService;

  const mockPrismaService = {
    business: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    service: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockWebhooksService = {
    dispatchGoogleSheetsWebhook: jest.fn().mockResolvedValue({ sent: true, status: 200 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WebhooksService, useValue: mockWebhooksService },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    webhooksService = module.get<WebhooksService>(WebhooksService);
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

  describe('create', () => {
    it('should throw NotFoundException if business is not found', async () => {
      mockPrismaService.business.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          businessId: 'invalid-biz',
          clientName: 'Ana',
          clientPhone: '5511999999999',
          serviceName: 'Botox',
          date: '2026-10-28 14:00',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should create appointment and dispatch Google Sheets webhook', async () => {
      const mockBusiness = { id: 'biz-1', name: 'Clínica Bella' };
      const mockService = { id: 'srv-1', name: 'Botox', price: 800, durationInMinutes: 45 };
      const mockAppointment = {
        id: 'app-1',
        businessId: 'biz-1',
        business: mockBusiness,
        serviceId: 'srv-1',
        service: mockService,
        clientName: 'Ana Silva',
        clientPhone: '5511999999999',
        date: new Date('2026-10-28T14:00:00.000Z'),
        status: 'CONFIRMED',
        createdAt: new Date('2026-10-27T10:00:00.000Z'),
      };

      mockPrismaService.business.findFirst.mockResolvedValue(mockBusiness);
      mockPrismaService.service.findFirst.mockResolvedValue(mockService);
      mockPrismaService.appointment.create.mockResolvedValue(mockAppointment);

      const result = await service.create({
        businessId: 'biz-1',
        clientName: 'Ana Silva',
        clientPhone: '5511999999999',
        serviceName: 'Botox',
        date: '2026-10-28T14:00:00.000Z',
      });

      expect(result.success).toBe(true);
      expect(mockPrismaService.appointment.create).toHaveBeenCalled();
      expect(mockWebhooksService.dispatchGoogleSheetsWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'appointment.confirmed',
          id: 'app-1',
          clientName: 'Ana Silva',
          clientPhone: '5511999999999',
          serviceName: 'Botox',
          servicePrice: 800,
          businessName: 'Clínica Bella',
          status: 'CONFIRMED',
        })
      );
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
      const mockAppointment = {
        id: '1',
        status: 'PENDING',
        business: { name: 'Clínica' },
        service: { name: 'Massagem', price: 150, durationInMinutes: 60 },
        date: new Date(),
        createdAt: new Date(),
      };
      const updatedAppointment = {
        ...mockAppointment,
        status: 'CONFIRMED',
      };

      mockPrismaService.appointment.findUnique.mockResolvedValue(mockAppointment);
      mockPrismaService.appointment.update.mockResolvedValue(updatedAppointment);

      const result = await service.updateStatus('1', 'CONFIRMED');

      expect(mockPrismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { status: 'CONFIRMED' },
        include: { service: true, business: true },
      });
      expect(mockWebhooksService.dispatchGoogleSheetsWebhook).toHaveBeenCalled();
      expect(result).toEqual(updatedAppointment);
    });
  });
});

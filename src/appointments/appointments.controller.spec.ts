import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let service: AppointmentsService;

  const mockAppointmentsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: mockAppointmentsService },
      ],
    }).compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
    service = module.get<AppointmentsService>(AppointmentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service findAll', async () => {
      mockAppointmentsService.findAll.mockResolvedValue([]);
      await controller.findAll('biz-1');
      expect(mockAppointmentsService.findAll).toHaveBeenCalledWith('biz-1');
    });
  });

  describe('create', () => {
    it('should call service create', async () => {
      const dto = {
        businessId: 'biz-1',
        clientName: 'Ana',
        clientPhone: '5511999999999',
        serviceName: 'Botox',
        date: '2026-10-28 14:00',
      };
      mockAppointmentsService.create.mockResolvedValue({ success: true });
      const result = await controller.create(dto);

      expect(mockAppointmentsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('updateStatus', () => {
    it('should call service updateStatus', async () => {
      mockAppointmentsService.updateStatus.mockResolvedValue({});
      await controller.updateStatus('1', { status: 'CONFIRMED' });
      expect(mockAppointmentsService.updateStatus).toHaveBeenCalledWith('1', 'CONFIRMED');
    });
  });
});

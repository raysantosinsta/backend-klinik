import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let service: AppointmentsService;

  const mockAppointmentsService = {
    findAll: jest.fn(),
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

  describe('updateStatus', () => {
    it('should call service updateStatus', async () => {
      mockAppointmentsService.updateStatus.mockResolvedValue({});
      await controller.updateStatus('1', { status: 'CONFIRMED' });
      expect(mockAppointmentsService.updateStatus).toHaveBeenCalledWith('1', 'CONFIRMED');
    });
  });
});

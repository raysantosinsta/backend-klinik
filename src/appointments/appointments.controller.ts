import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get(':businessId')
  async findAll(@Param('businessId') businessId: string) {
    return this.appointmentsService.findAll(businessId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.appointmentsService.updateStatus(id, body.status);
  }
}

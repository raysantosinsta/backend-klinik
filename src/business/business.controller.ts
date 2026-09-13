import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { BusinessService } from './business.service';

@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get(':id')
  async getBusiness(@Param('id') id: string) {
    return this.businessService.getBusiness(id);
  }

  @Patch(':id/ownerPhone')
  async updateOwnerPhone(
    @Param('id') id: string,
    @Body() body: { ownerPhone: string },
  ) {
    return this.businessService.updateOwnerPhone(id, body.ownerPhone);
  }
}

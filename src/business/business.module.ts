import { Module } from '@nestjs/common';
import { BusinessService } from './business.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessController } from 'src/business/business.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}

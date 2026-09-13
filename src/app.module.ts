import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { DocumentsModule } from './documents/documents.module';
import { ChatModule } from './chat/chat.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { UsersModule } from './users/users.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { BusinessModule } from './business/business.module';

@Module({
  imports: [PrismaModule, ServicesModule, DocumentsModule, ChatModule, WhatsappModule, UsersModule, AppointmentsModule, BusinessModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

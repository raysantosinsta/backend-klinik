import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { DocumentsModule } from './documents/documents.module';
import { ChatModule } from './chat/chat.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, ServicesModule, DocumentsModule, ChatModule, WhatsappModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

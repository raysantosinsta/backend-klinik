import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';

import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { WhatsappProcessor } from './whatsapp.processor';

import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
  imports: [
    PrismaModule, 
    ChatModule,
    BullModule.registerQueue({
      name: 'whatsapp_messages',
    }),
    BullBoardModule.forFeature({
      name: 'whatsapp_messages',
      adapter: BullMQAdapter,
    }),
    HttpModule
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappProcessor],
})
export class WhatsappModule {}

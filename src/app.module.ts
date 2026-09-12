import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [PrismaModule, ServicesModule, DocumentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

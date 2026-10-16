import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Prisma conectado ao PostgreSQL com sucesso.');
    } catch (error) {
      console.error('⚠️ Aviso: Falha inicial ao conectar Prisma no boot:', error?.message || error);
      console.error('O Prisma tentará reconectar automaticamente nas próximas consultas.');
    }
  }
}

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Permite certificados intermediários/self-signed do Supabase na nuvem
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function getSanitizedDbUrl(): string {
  let url = process.env.DATABASE_URL || '';
  if (!url) return url;

  // Redireciona host direto do Supabase (IPv6) para o Pooler IPv4
  if (url.includes('.supabase.co:5432')) {
    url = url.replace(
      /db\.[^.]+\.supabase\.co:5432/,
      'aws-0-us-east-1.pooler.supabase.com:5432',
    );
    if (!url.includes('postgres.hhnsjkksizlqaamqoyvl')) {
      url = url.replace('postgres:', 'postgres.hhnsjkksizlqaamqoyvl:');
    }
  }

  // Se a senha tiver o '@' cru, corrige para '%40'
  const atParts = url.split('@');
  if (atParts.length > 2) {
    const hostAndQuery = atParts.pop();
    const userAndPass = atParts.join('%40');
    url = `${userAndPass}@${hostAndQuery}`;
  }

  // Remove qualquer query parameter (ex: ?sslmode=require) que force o pg a sobrescrever rejectUnauthorized
  url = url.split('?')[0];

  return url;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const connectionString = getSanitizedDbUrl();
    const pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10,
    });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
    } as any);

    this.pool = pool;
    const masked = connectionString.replace(/:([^:@]+)@/, ':****@');
    console.log('🔌 [PrismaService] Conectado via pg Driver Adapter (Node TLS):', masked);
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Prisma conectado ao PostgreSQL via Driver Adapter com sucesso.');
    } catch (error: any) {
      console.error('⚠️ Falha ao conectar Prisma no boot:', error?.message || error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.pool) {
      await this.pool.end();
    }
  }
}


import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function getSanitizedDbUrl(): string {
  let url = process.env.DATABASE_URL || '';
  if (!url) return url;

  // 1. Redireciona host direto do Supabase (IPv6) para o Pooler IPv4 (aws-0-us-east-1.pooler.supabase.com)
  // pois o Render não tem saída IPv6 por padrão
  if (url.includes('.supabase.co:5432')) {
    url = url.replace(
      /db\.[^.]+\.supabase\.co:5432/,
      'aws-0-us-east-1.pooler.supabase.com:5432',
    );
    if (!url.includes('postgres.hhnsjkksizlqaamqoyvl')) {
      url = url.replace('postgres:', 'postgres.hhnsjkksizlqaamqoyvl:');
    }
  }

  // 2. Se a senha tiver o '@' cru (ex: Blessedhr10@5750@aws-0...), quebra o parser do Prisma
  const atParts = url.split('@');
  if (atParts.length > 2) {
    const hostAndQuery = atParts.pop();
    const userAndPass = atParts.join('%40');
    url = `${userAndPass}@${hostAndQuery}`;
  }

  // 3. Garante que os parâmetros de SSL para Linux/Render estejam sempre presentes
  if (!url.includes('sslmode=')) {
    url += (url.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  if (!url.includes('sslaccept=')) {
    url += '&sslaccept=accept_invalid_certs';
  }

  return url;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const finalUrl = getSanitizedDbUrl();
    super({
      datasources: {
        db: {
          url: finalUrl,
        },
      },
    });

    const masked = finalUrl.replace(/:([^:@]+)@/, ':****@');
    console.log('🔌 [PrismaService] Conectando ao banco:', masked);
  }

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

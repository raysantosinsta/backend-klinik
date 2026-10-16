import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';

async function bootstrap() {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple(),
      ),
    }),
  ];

  if (process.env.LOKI_ENABLED === 'true') {
    transports.push(
      new LokiTransport({
        host: process.env.LOKI_HOST || 'http://127.0.0.1:3100',
        labels: { app: 'nestjs-backend' },
        json: true,
        format: winston.format.json(),
        replaceTimestamp: true,
        onConnectionError: (err) => console.error(err),
      }),
    );
  }

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports,
    }),
  });
  app.enableCors(); // Habilita o CORS para o frontend conseguir acessar
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();

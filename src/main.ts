import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.simple(),
          ),
        }),
        new LokiTransport({
          host: 'http://127.0.0.1:3100', // Loki URL
          labels: { app: 'nestjs-backend' },
          json: true,
          format: winston.format.json(),
          replaceTimestamp: true,
          onConnectionError: (err) => console.error(err)
        }),
      ],
    }),
  });
  app.enableCors(); // Habilita o CORS para o frontend conseguir acessar
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();

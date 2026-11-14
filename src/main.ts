import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setup } from './api/setup';
async function bootstrap() {
  await ConfigModule.envVariablesLoaded;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 256 * 1024,
      trustProxy: process.env.TRUST_PROXY === 'true',
      requestTimeout: 30000,
    }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await setup(app);
  await app.listen(
    app.get(ConfigService).getOrThrow<number>('PORT'),
    '0.0.0.0',
  );
}
void bootstrap();

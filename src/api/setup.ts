import { ValidationPipe } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import multipart from '@fastify/multipart';
import { ProblemFilter } from './problem.filter';
import { documentResponses } from './openapi';
import { allowedOrigins } from './origins';
import { validationException } from './validation';
export async function setup(app: NestFastifyApplication) {
  const config = app.get(ConfigService);
  await app.register(cookie);
  await app.register(helmet, {
    frameguard: { action: 'deny' },
    hsts:
      config.get('NODE_ENV') === 'production'
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
  });
  await app.register(compress);
  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    throwFileSizeLimit: true,
  });
  app.enableCors({
    origin: allowedOrigins(config),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (_req, reply, payload) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      return payload;
    });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
      exceptionFactory: validationException,
    }),
  );
  app.useGlobalFilters(new ProblemFilter());
  // Keep development docs off the public production surface.
  if (config.get('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Coaching Platform API')
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    documentResponses(document);
    SwaggerModule.setup('api/docs', app, document);
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from '../src/config/environment';

const environment = {
  DATABASE_URL: 'postgresql://localhost/coaching_test',
  JWT_SECRET: 'a'.repeat(32),
  APP_ORIGIN: 'http://localhost:4200',
  PUBLIC_APP_URL: 'http://localhost:4200',
  COACH_WHATSAPP: '201205491410',
};

@Controller()
@UseGuards(ThrottlerGuard)
class ProxyTestController {
  @Get()
  index() {
    return { ok: true };
  }
}

describe('proxy configuration', () => {
  it('ignores proxy headers by default', () => {
    expect(validateEnvironment(environment).TRUST_PROXY).toBe(false);
  });

  it.each(['true', 'false'])('accepts TRUST_PROXY=%s', (value) => {
    expect(
      validateEnvironment({ ...environment, TRUST_PROXY: value }).TRUST_PROXY,
    ).toBe(value === 'true');
  });

  it.each(['1', '', 'invalid'])('rejects invalid TRUST_PROXY: %s', (value) => {
    expect(() =>
      validateEnvironment({ ...environment, TRUST_PROXY: value }),
    ).toThrow('TRUST_PROXY must be true or false');
  });

  it.each([false, true])(
    'applies rate limits with trustProxy=%s',
    async (trustProxy) => {
      const module = await Test.createTestingModule({
        imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
        controllers: [ProxyTestController],
      }).compile();
      const config = validateEnvironment({
        ...environment,
        TRUST_PROXY: String(trustProxy),
      });
      const app = module.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter({ trustProxy: config.TRUST_PROXY }),
        { logger: false },
      );
      try {
        await app.init();
        const request = (forwardedFor: string) =>
          app.inject({
            method: 'GET',
            url: '/',
            headers: { 'x-forwarded-for': forwardedFor },
          });
        for (let i = 0; i < 10; i++) {
          expect((await request('198.51.100.1')).statusCode).toBe(200);
        }
        expect((await request('198.51.100.1')).statusCode).toBe(429);
        expect((await request('198.51.100.2')).statusCode).toBe(
          trustProxy ? 200 : 429,
        );
      } finally {
        await app.close();
      }
    },
  );
});

import { ConfigService } from '@nestjs/config';
import { FastifyReply } from 'fastify';
import { AuthController } from '../src/api/controllers/auth.controller';
import { AuthService } from '../src/application/auth/auth.service';

describe('refresh cookie deployment policy', () => {
  it.each([true, false])(
    'uses cross-site cookies only with HTTPS (secure=%s)',
    async (secure) => {
      const auth = {
        login: jest.fn(async () => ({
          ok: true,
          value: {
            accessToken: 'fixture-access',
            refreshToken: 'fixture-refresh',
            expiresIn: 900,
          },
        })),
      } as unknown as AuthService;
      const reply = { setCookie: jest.fn() };
      const controller = new AuthController(
        auth,
        new ConfigService({ COOKIE_SECURE: secure }),
      );
      const result = await controller.login(
        { email: 'fixture@example.test', password: 'fixture-only' },
        reply as unknown as FastifyReply,
      );
      expect(reply.setCookie).toHaveBeenCalledWith(
        'refresh',
        'fixture-refresh',
        {
          httpOnly: true,
          secure,
          sameSite: secure ? 'none' : 'strict',
          path: '/api/v1/auth',
          maxAge: 30 * 86400,
        },
      );
      expect(result).toEqual({ accessToken: 'fixture-access', expiresIn: 900 });
      expect(result).not.toHaveProperty('refreshToken');
    },
  );
});

import { ConfigService } from '@nestjs/config';
import { FastifyReply } from 'fastify';
import { AuthController } from '../src/api/controllers/auth.controller';
import { AuthService } from '../src/application/auth/auth.service';

describe('refresh cookie deployment policy', () => {
  const now = Date.UTC(2026, 10, 18, 12);
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => jest.restoreAllMocks());
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
            refreshExpiresAt: new Date(now + 30 * 86400000),
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
          expires: new Date(now + 30 * 86400000),
        },
      );
      expect(result).toEqual({ accessToken: 'fixture-access', expiresIn: 900 });
      expect(result).not.toHaveProperty('refreshToken');
    },
  );
  it('never lets the cookie outlive the exact stored refresh-token deadline', async () => {
    const refreshExpiresAt = new Date(now + 30 * 86400000);
    const auth = {
      login: jest.fn(async () => {
        jest.spyOn(Date, 'now').mockReturnValue(now + 5123);
        return {
          ok: true,
          value: {
            accessToken: 'fixture-access',
            refreshToken: 'fixture-refresh',
            expiresIn: 900,
            refreshExpiresAt,
          },
        };
      }),
    } as unknown as AuthService;
    const reply = { setCookie: jest.fn() };
    await new AuthController(
      auth,
      new ConfigService({ COOKIE_SECURE: true }),
    ).login(
      { email: 'fixture@example.test', password: 'fixture-only' },
      reply as unknown as FastifyReply,
    );
    const options = reply.setCookie.mock.calls[0][2];
    expect(options.expires).toBe(refreshExpiresAt);
    expect(options.maxAge).toBeUndefined();
    expect(options.expires.getTime()).toBe(refreshExpiresAt.getTime());
  });
});

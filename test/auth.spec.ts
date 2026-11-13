import { AuthService } from '../src/application/auth/auth.service';
import {
  AccessTokens,
  Crypto,
  Mail,
  Store,
} from '../src/application/common/ports';
import { CairoClock } from '../src/infrastructure/clock';
import { User } from '../src/domain/models';
const user: User = {
  id: 'user',
  email: 'client@example.com',
  passwordHash: 'hash',
  role: 'Client',
  failedLogins: 0,
  lockedUntil: null,
};
describe('refresh token theft detection', () => {
  const revokeFamily = jest.fn();
  const rotateSession = jest.fn();
  const session = jest.fn();
  const db = {
    session,
    revokeFamily,
    rotateSession,
    userById: async () => user,
  } as unknown as Store;
  const crypto = {
    digest: (x: string) => x,
    random: () => 'new-secret',
  } as Crypto;
  const jwt = { sign: async () => 'access' } as AccessTokens;
  const service = new AuthService(
    db,
    crypto,
    jwt,
    new CairoClock(),
    {} as Mail,
    { whatsapp: '201000000000', reminderLeadDays: 3, auditRetentionDays: 365 },
  );
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('revokes the entire family when a consumed token is reused', async () => {
    session.mockResolvedValue({
      id: 't',
      userId: 'user',
      family: 'f',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
    });
    const result = await service.refresh('old');
    expect(result.ok).toBe(false);
    expect(revokeFamily).toHaveBeenCalledWith('f', expect.any(Date));
    expect(rotateSession).not.toHaveBeenCalled();
  });
  it('revokes the family on a concurrent reuse race', async () => {
    session.mockResolvedValue({
      id: 't',
      userId: 'user',
      family: 'f',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });
    rotateSession.mockResolvedValue(false);
    expect((await service.refresh('old')).ok).toBe(false);
    expect(revokeFamily).toHaveBeenCalled();
  });
  it('rotates an unused token and stores only its hash', async () => {
    session.mockResolvedValue({
      id: 't',
      userId: 'user',
      family: 'f',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });
    rotateSession.mockResolvedValue(true);
    expect(await service.refresh('old')).toMatchObject({
      ok: true,
      value: { accessToken: 'access', refreshToken: 'new-secret' },
    });
    expect(rotateSession).toHaveBeenCalledWith(
      't',
      expect.objectContaining({ tokenHash: 'new-secret', family: 'f' }),
      expect.any(Date),
    );
  });
});

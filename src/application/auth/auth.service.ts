import {
  AccessTokens,
  Clock,
  Crypto,
  Mail,
  Settings,
  Store,
} from '../common/ports';
import { fail, ok } from '../../domain/result';
import { User } from '../../domain/models';

export type RefreshDiagnostic =
  | 'refresh_cookie_missing'
  | 'refresh_token_unknown'
  | 'refresh_token_expired'
  | 'refresh_user_missing'
  | 'refresh_validated'
  | 'refresh_rotation_started'
  | 'refresh_rotated'
  | 'refresh_reuse_detected'
  | 'refresh_rotation_conflict'
  | 'refresh_family_revoked';

export class AuthService {
  constructor(
    private readonly db: Store,
    private readonly crypto: Crypto,
    private readonly jwt: AccessTokens,
    private readonly clock: Clock,
    private readonly mail: Mail,
    private readonly settings: Settings,
  ) {}
  async register(input: {
    email: string;
    password: string;
    fullName: string;
    whatsapp: string;
    consent: boolean;
  }) {
    if (!input.consent)
      return fail(
        'CONSENT_REQUIRED',
        'الموافقة الصريحة على معالجة البيانات مطلوبة',
      );
    const user = await this.db.register({
      ...input,
      email: input.email.toLowerCase(),
      passwordHash: await this.crypto.hash(input.password),
      consentAt: this.clock.now(),
    });
    if (!user)
      return fail('EMAIL_EXISTS', 'البريد الإلكتروني مستخدم بالفعل', 409);
    return ok({
      id: user.id,
      status: 'Pending',
      whatsappUrl: this.whatsapp(user.email),
    });
  }
  private whatsapp(email: string) {
    return `https://wa.me/${this.settings.whatsapp}?text=${encodeURIComponent(`مرحباً، سجلت في منصة التدريب وأرغب في تفعيل اشتراكي. بريدي الإلكتروني: ${email}`)}`;
  }
  async login(email: string, password: string) {
    const now = this.clock.now();
    const user = await this.db.userByEmail(email.toLowerCase());
    if (!user) {
      // Keep password verification work for unknown accounts too.
      await this.crypto.hash(password);
      return fail(
        'INVALID_CREDENTIALS',
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        401,
      );
    }
    if (user.lockedUntil && user.lockedUntil > now)
      return fail('ACCOUNT_LOCKED', 'الحساب مقفل مؤقتاً. حاول لاحقاً', 429);
    if (!(await this.crypto.verify(user.passwordHash, password))) {
      await this.db.loginFailure(user.id, now);
      return fail(
        'INVALID_CREDENTIALS',
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        401,
      );
    }
    await this.db.loginSuccess(user.id);
    return ok(await this.issue(user));
  }
  private async issue(user: User) {
    const raw = this.crypto.random();
    const refreshExpiresAt = new Date(
      this.clock.now().getTime() + 30 * 86400000,
    );
    await this.db.addSession({
      userId: user.id,
      family: this.crypto.uuid(),
      tokenHash: this.crypto.digest(raw),
      expiresAt: refreshExpiresAt,
    });
    return {
      accessToken: await this.jwt.sign(user),
      expiresIn: 900,
      refreshToken: raw,
      refreshExpiresAt,
    };
  }
  async refresh(
    raw?: string,
    debug: (event: RefreshDiagnostic) => void = () => undefined,
  ) {
    if (!raw) {
      debug('refresh_cookie_missing');
      return fail('INVALID_SESSION', 'الجلسة غير صالحة', 401);
    }
    const token = await this.db.session(this.crypto.digest(raw));
    const now = this.clock.now();
    if (!token) {
      debug('refresh_token_unknown');
      return fail('INVALID_SESSION', 'الجلسة غير صالحة', 401);
    }
    if (token.revokedAt) {
      debug('refresh_reuse_detected');
      await this.db.revokeFamily(token.family, now);
      debug('refresh_family_revoked');
      return fail('SESSION_REUSED', 'انتهت الجلسة. سجل الدخول مرة أخرى', 401);
    }
    if (token.expiresAt <= now) {
      debug('refresh_token_expired');
      return fail('INVALID_SESSION', 'انتهت الجلسة', 401);
    }
    const user = await this.db.userById(token.userId);
    if (!user) {
      debug('refresh_user_missing');
      return fail('INVALID_SESSION', 'الجلسة غير صالحة', 401);
    }
    debug('refresh_validated');
    const next = this.crypto.random();
    const refreshExpiresAt = new Date(now.getTime() + 30 * 86400000);
    debug('refresh_rotation_started');
    if (
      !(await this.db.rotateSession(
        token.id,
        {
          userId: user.id,
          family: token.family,
          tokenHash: this.crypto.digest(next),
          expiresAt: refreshExpiresAt,
        },
        now,
      ))
    ) {
      debug('refresh_rotation_conflict');
      await this.db.revokeFamily(token.family, now);
      debug('refresh_family_revoked');
      return fail('SESSION_REUSED', 'انتهت الجلسة. سجل الدخول مرة أخرى', 401);
    }
    debug('refresh_rotated');
    return ok({
      accessToken: await this.jwt.sign(user),
      expiresIn: 900,
      refreshToken: next,
      refreshExpiresAt,
    });
  }
  async logout(raw?: string) {
    const token = raw ? await this.db.session(this.crypto.digest(raw)) : null;
    if (token) await this.db.revokeFamily(token.family, this.clock.now());
    return ok({ message: 'تم تسجيل الخروج' });
  }
  async forgot(email: string) {
    const user = await this.db.userByEmail(email.toLowerCase());
    if (user) {
      const token = this.crypto.random();
      await this.db.createReset(
        user.id,
        this.crypto.digest(token),
        new Date(this.clock.now().getTime() + 30 * 60000),
      );
      // The adapter retries, logs only a stable code, and never propagates delivery failures.
      await this.mail.reset(user.email, token);
    }
    return ok({
      message: 'إذا كان البريد مسجلاً فستصلك رسالة لإعادة تعيين كلمة المرور',
    });
  }
  async reset(token: string, password: string) {
    return (await this.db.resetPassword(
      this.crypto.digest(token),
      await this.crypto.hash(password),
      this.clock.now(),
    ))
      ? ok({ message: 'تم تحديث كلمة المرور' })
      : fail('INVALID_RESET_TOKEN', 'رابط إعادة التعيين غير صالح أو منتهي');
  }
}

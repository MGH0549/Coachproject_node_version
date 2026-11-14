export function validateEnvironment(env: Record<string, unknown>) {
  const required = (name: string) => {
    const value = String(env[name] ?? '').trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const database = required('DATABASE_URL');
  if (!/^postgres(ql)?:\/\//.test(database))
    throw new Error('DATABASE_URL must use PostgreSQL');
  const secret = required('JWT_SECRET');
  if (secret.length < 32 || secret.includes('replace-with'))
    throw new Error('JWT_SECRET must contain at least 32 random characters');
  const origin = new URL(required('APP_ORIGIN'));
  const app = new URL(required('PUBLIC_APP_URL'));
  const production = env.NODE_ENV === 'production';
  if (production && (origin.protocol !== 'https:' || app.protocol !== 'https:'))
    throw new Error('Production URLs must use HTTPS');
  if (origin.origin !== origin.href.replace(/\/$/, ''))
    throw new Error('APP_ORIGIN must contain only an origin');
  if (env.APP_TIME_ZONE && env.APP_TIME_ZONE !== 'Africa/Cairo')
    throw new Error('APP_TIME_ZONE must be Africa/Cairo');
  const whatsapp = required('COACH_WHATSAPP');
  if (!/^\d{8,15}$/.test(whatsapp))
    throw new Error('COACH_WHATSAPP must be an international number without +');
  const positiveInt = (key: string, fallback: number, max: number) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > max)
      throw new Error(`${key} is invalid`);
    return n;
  };
  if (production)
    for (const key of [
      'RESEND_API_KEY',
      'EMAIL_FROM',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ])
      required(key);
  if (production && env.COOKIE_SECURE === 'false')
    throw new Error('Production cookies must be secure');
  if (
    env.TRUST_PROXY !== undefined &&
    env.TRUST_PROXY !== 'true' &&
    env.TRUST_PROXY !== 'false'
  )
    throw new Error('TRUST_PROXY must be true or false');
  return {
    ...env,
    DATABASE_URL: database,
    JWT_SECRET: secret,
    APP_ORIGIN: origin.origin,
    PUBLIC_APP_URL: app.href.replace(/\/$/, ''),
    APP_TIME_ZONE: 'Africa/Cairo',
    COACH_WHATSAPP: whatsapp,
    PORT: positiveInt('PORT', 3000, 65535),
    REMINDER_LEAD_DAYS: positiveInt('REMINDER_LEAD_DAYS', 3, 365),
    AUDIT_RETENTION_DAYS: positiveInt('AUDIT_RETENTION_DAYS', 365, 3650),
    COOKIE_SECURE: production || env.COOKIE_SECURE === 'true',
    TRUST_PROXY: env.TRUST_PROXY === 'true',
  };
}

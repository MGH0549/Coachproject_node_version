import { ConfigService } from '@nestjs/config';

export function allowedOrigins(config: ConfigService): string[] {
  const origins = [config.getOrThrow<string>('APP_ORIGIN')];
  if (config.get<string>('NODE_ENV') !== 'production') {
    const port = config.getOrThrow<number>('PORT');
    origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  return [...new Set(origins)];
}

import { ConfigService } from '@nestjs/config';
import { allowedOrigins } from '../src/api/origins';

describe('browser origin policy', () => {
  it('allows the frontend and local Swagger on the configured development port', () => {
    const origins = allowedOrigins(
      new ConfigService({
        NODE_ENV: 'development',
        APP_ORIGIN: 'http://localhost:4200',
        PORT: 3000,
      }),
    );
    expect(origins).toEqual([
      'http://localhost:4200',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    expect(origins).not.toContain('http://localhost:3001');
    expect(origins).not.toContain('https://attacker.example');
  });

  it('allows only the configured frontend in production', () => {
    expect(
      allowedOrigins(
        new ConfigService({
          NODE_ENV: 'production',
          APP_ORIGIN: 'https://app.example.com',
          PORT: 3000,
        }),
      ),
    ).toEqual(['https://app.example.com']);
  });
});

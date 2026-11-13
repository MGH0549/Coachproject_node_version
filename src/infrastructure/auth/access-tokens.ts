import { JwtService } from '@nestjs/jwt';
import { AccessTokens } from '../../application/common/ports';
import { User } from '../../domain/models';
export class JwtAccessTokens implements AccessTokens {
  constructor(private readonly jwt: JwtService) {}
  sign(user: User) {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role },
      {
        expiresIn: '15m',
        issuer: 'coaching-api',
        audience: 'coaching-app',
        algorithm: 'HS256',
      },
    );
  }
}

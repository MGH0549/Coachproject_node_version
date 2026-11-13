import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../../application/auth/auth.service';
import { ForgotDto, LoginDto, RegisterDto, ResetDto } from '../dtos';
import { Public } from '../security';
import { unwrap } from '../problem.filter';
@ApiTags('Authentication')
@Public()
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  private cookie(reply: FastifyReply, token: string) {
    reply.setCookie('refresh', token, {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('COOKIE_SECURE'),
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 86400,
    });
  }
  @Post('register') async register(@Body() dto: RegisterDto) {
    return unwrap(await this.auth.register(dto));
  }
  @Post('login') @HttpCode(200) async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = unwrap(await this.auth.login(dto.email, dto.password));
    this.cookie(reply, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }
  @Post('refresh') @HttpCode(200) async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.refresh(req.cookies.refresh);
    if (!result.ok) reply.clearCookie('refresh', { path: '/api/v1/auth' });
    const session = unwrap(result);
    this.cookie(reply, session.refreshToken);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }
  @Post('logout') @HttpCode(200) async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = unwrap(await this.auth.logout(req.cookies.refresh));
    reply.clearCookie('refresh', { path: '/api/v1/auth' });
    return result;
  }
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgot(@Body() dto: ForgotDto) {
    return unwrap(await this.auth.forgot(dto.email));
  }
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async reset(@Body() dto: ResetDto) {
    return unwrap(await this.auth.reset(dto.token, dto.password));
  }
}

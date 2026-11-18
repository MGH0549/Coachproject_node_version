import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
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
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  private cookieOptions() {
    const secure = this.config.getOrThrow<boolean>('COOKIE_SECURE');
    return {
      httpOnly: true,
      secure,
      sameSite: secure ? ('none' as const) : ('strict' as const),
      path: '/api/v1/auth',
    };
  }
  private cookie(reply: FastifyReply, token: string) {
    reply.setCookie('refresh', token, {
      ...this.cookieOptions(),
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
    this.debug(req, 'refresh_received', {
      cookiePresent: Boolean(req.cookies.refresh),
    });
    const result = await this.auth.refresh(req.cookies.refresh, (event) =>
      this.debug(req, event),
    );
    if (!result.ok) reply.clearCookie('refresh', this.cookieOptions());
    const session = unwrap(result);
    this.cookie(reply, session.refreshToken);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }
  @Post('logout') @HttpCode(200) async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.debug(req, 'logout_requested');
    const result = unwrap(await this.auth.logout(req.cookies.refresh));
    reply.clearCookie('refresh', this.cookieOptions());
    return result;
  }
  private debug(
    req: FastifyRequest,
    event: string,
    details: { cookiePresent?: boolean } = {},
  ) {
    if (this.config.get<boolean>('AUTH_DEBUG')) {
      this.logger.log({
        event: `auth.${event}`,
        requestId: req.id,
        ...details,
      });
    }
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

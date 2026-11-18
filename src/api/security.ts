import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { Actor, Role } from '../domain/models';
import { PrismaStore } from '../infrastructure/database/store';
import { requireActive } from '../domain/rules/access';
import { allowedOrigins } from './origins';
export type ApiRequest = FastifyRequest & { user: Actor };
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const Active = () => SetMetadata('active', true);
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly db: PrismaStore,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: 'coaching-api',
      audience: 'coaching-app',
    });
  }
  async validate(payload: { sub?: string }) {
    if (!payload.sub || !/^[a-f0-9-]{36}$/i.test(payload.sub))
      throw new UnauthorizedException();
    const user = await this.db.userById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      role: user.role,
      clientId: user.clientId,
    } satisfies Actor;
  }
}
@Injectable()
export class AuthenticationGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(AuthenticationGuard.name);
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super();
  }
  handleRequest<TUser = Actor>(
    error: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (
      this.config.get<boolean>('AUTH_DEBUG') &&
      info instanceof Error &&
      info.name === 'TokenExpiredError'
    ) {
      const req = context.switchToHttp().getRequest<FastifyRequest>();
      this.logger.log({
        event: 'auth.access_token_expired',
        requestId: req.id,
      });
    }
    return super.handleRequest<TUser>(error, user, info, context);
  }
  canActivate(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>('public', [
      context.getHandler(),
      context.getClass(),
    ])
      ? true
      : super.canActivate(context);
  }
}
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaStore,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets))
      return true;
    const actor = context.switchToHttp().getRequest<ApiRequest>().user;
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (!actor || (roles && !roles.includes(actor.role)))
      throw new ForbiddenException({
        code: 'ROLE_FORBIDDEN',
        message: 'غير مسموح بهذه العملية',
      });
    if (
      actor.role === 'Client' &&
      this.reflector.getAllAndOverride<boolean>('active', targets)
    ) {
      const client = actor.clientId
        ? await this.db.client(actor.clientId)
        : null;
      const result = client ? requireActive(client) : null;
      if (!result?.ok)
        throw new ForbiddenException({
          code: 'ACCESS_INACTIVE',
          message: 'الاشتراك غير نشط. تواصل مع المدرب',
        });
    }
    return true;
  }
}
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.headers.origin;
    if (
      (origin && !allowedOrigins(this.config).includes(origin)) ||
      (req.cookies?.refresh && !origin)
    )
      throw new ForbiddenException({
        code: 'ORIGIN_FORBIDDEN',
        message: 'مصدر الطلب غير مسموح',
      });
    return true;
  }
}

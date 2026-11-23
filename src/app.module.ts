import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { validateEnvironment } from './config/environment';
import { PrismaService } from './infrastructure/database/prisma.service';
import { PrismaStore } from './infrastructure/database/store';
import { CairoClock } from './infrastructure/clock';
import { ArgonCrypto } from './infrastructure/auth/crypto';
import { JwtAccessTokens } from './infrastructure/auth/access-tokens';
import { ResendMail } from './infrastructure/email/resend-mail';
import { CloudinaryPhotos } from './infrastructure/cloudinary/cloudinary-photos';
import { ScheduledJobs } from './infrastructure/jobs';
import { AuthService } from './application/auth/auth.service';
import { ClientsService } from './application/clients/clients.service';
import { PrivacyService } from './application/clients/privacy.service';
import { ExercisesService } from './application/exercises/exercises.service';
import { TrainingService } from './application/training/training.service';
import { DietService } from './application/diet/diet.service';
import { ProgressService } from './application/progress/progress.service';
import { StrengthService } from './application/progress/strength.service';
import { TemplatesService } from './application/templates/templates.service';
import { HousekeepingService } from './application/common/housekeeping.service';
import { Settings } from './application/common/ports';
import {
  AuthenticationGuard,
  AuthorizationGuard,
  JwtStrategy,
  OriginGuard,
} from './api/security';
import { AuthController } from './api/controllers/auth.controller';
import { ClientController } from './api/controllers/client.controller';
import { CoachController } from './api/controllers/coach.controller';
import { TemplatesController } from './api/controllers/templates.controller';
import { HealthController } from './api/controllers/health.controller';
const SETTINGS = Symbol('settings');
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: process.env.NODE_ENV !== 'test',
        genReqId: () => randomUUID(),
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: String(req.url ?? '').split('?')[0],
          }),
          res: (res) => ({ statusCode: res.statusCode }),
          err: () => ({ code: 'REQUEST_FAILED' }),
        },
      },
    }),
  ],
  controllers: [
    AuthController,
    ClientController,
    CoachController,
    TemplatesController,
    HealthController,
  ],
  providers: [
    {
      provide: StrengthService,
      inject: [PrismaStore, CairoClock],
      useFactory: (db: PrismaStore, clock: CairoClock) =>
        new StrengthService(db, clock),
    },
    PrismaService,
    PrismaStore,
    ArgonCrypto,
    JwtStrategy,
    ThrottlerGuard,
    {
      provide: CairoClock,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new CairoClock(c.getOrThrow('APP_TIME_ZONE')),
    },
    {
      provide: SETTINGS,
      inject: [ConfigService],
      useFactory: (c: ConfigService): Settings => ({
        whatsapp: c.getOrThrow('COACH_WHATSAPP'),
        reminderLeadDays: c.getOrThrow('REMINDER_LEAD_DAYS'),
        auditRetentionDays: c.getOrThrow('AUDIT_RETENTION_DAYS'),
      }),
    },
    {
      provide: JwtAccessTokens,
      inject: [JwtService],
      useFactory: (jwt: JwtService) => new JwtAccessTokens(jwt),
    },
    {
      provide: ResendMail,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new ResendMail(
          c.get('RESEND_API_KEY') ?? '',
          c.get('EMAIL_FROM') ?? '',
          c.getOrThrow('PUBLIC_APP_URL'),
        ),
    },
    {
      provide: CloudinaryPhotos,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new CloudinaryPhotos(
          c.get('CLOUDINARY_CLOUD_NAME') ?? '',
          c.get('CLOUDINARY_API_KEY') ?? '',
          c.get('CLOUDINARY_API_SECRET') ?? '',
        ),
    },
    {
      provide: AuthService,
      inject: [
        PrismaStore,
        ArgonCrypto,
        JwtAccessTokens,
        CairoClock,
        ResendMail,
        SETTINGS,
      ],
      useFactory: (
        db: PrismaStore,
        crypto: ArgonCrypto,
        jwt: JwtAccessTokens,
        clock: CairoClock,
        mail: ResendMail,
        settings: Settings,
      ) => new AuthService(db, crypto, jwt, clock, mail, settings),
    },
    {
      provide: ClientsService,
      inject: [PrismaStore, CairoClock, SETTINGS],
      useFactory: (db: PrismaStore, clock: CairoClock, settings: Settings) =>
        new ClientsService(db, clock, settings),
    },
    {
      provide: PrivacyService,
      inject: [PrismaStore, CloudinaryPhotos],
      useFactory: (db: PrismaStore, photos: CloudinaryPhotos) =>
        new PrivacyService(db, photos),
    },
    {
      provide: ExercisesService,
      inject: [PrismaStore],
      useFactory: (db: PrismaStore) => new ExercisesService(db),
    },
    {
      provide: TrainingService,
      inject: [PrismaStore],
      useFactory: (db: PrismaStore) => new TrainingService(db),
    },
    {
      provide: DietService,
      inject: [PrismaStore],
      useFactory: (db: PrismaStore) => new DietService(db),
    },
    {
      provide: ProgressService,
      inject: [PrismaStore, CairoClock, CloudinaryPhotos],
      useFactory: (
        db: PrismaStore,
        clock: CairoClock,
        photos: CloudinaryPhotos,
      ) => new ProgressService(db, clock, photos),
    },
    {
      provide: TemplatesService,
      inject: [PrismaStore, TrainingService, DietService],
      useFactory: (
        db: PrismaStore,
        training: TrainingService,
        diet: DietService,
      ) => new TemplatesService(db, training, diet),
    },
    {
      provide: HousekeepingService,
      inject: [PrismaStore, CairoClock, ResendMail, CloudinaryPhotos, SETTINGS],
      useFactory: (
        db: PrismaStore,
        clock: CairoClock,
        mail: ResendMail,
        photos: CloudinaryPhotos,
        settings: Settings,
      ) => new HousekeepingService(db, clock, mail, photos, settings),
    },
    ScheduledJobs,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
})
export class AppModule {}

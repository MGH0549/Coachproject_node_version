import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { ArgonCrypto } from '../../src/infrastructure/auth/crypto';
import { CairoClock } from '../../src/infrastructure/clock';
import { CloudinaryPhotos } from '../../src/infrastructure/cloudinary/cloudinary-photos';
import { ResendMail } from '../../src/infrastructure/email/resend-mail';
import { setup } from '../../src/api/setup';
import { StrengthSet, Training } from '../../src/domain/models';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !/test/i.test(new URL(databaseUrl).pathname))
  throw new Error('TEST_DATABASE_URL must point to a dedicated test database');
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET ??=
  'integration-only-secret-with-at-least-32-characters';
process.env.APP_ORIGIN ??= 'http://localhost:4200';
process.env.PUBLIC_APP_URL ??= 'http://localhost:4200';
process.env.COACH_WHATSAPP ??= '201000000000';
process.env.NODE_ENV = 'test';

describe('strength log PostgreSQL API', () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let clock: CairoClock;
  let coachToken: string;
  let owner: { id: string; token: string };
  let other: { id: string; token: string };
  let plan: Training;
  let otherPlan: Training;
  const suffix = `strength-${randomUUID()}`;
  const emails = ['coach', 'owner', 'other'].map(
    (label) => `${label}-${suffix}@example.com`,
  );
  const password = 'StrengthPassword123';
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sets = (count: number, weightKg = 80.25): StrengthSet[] =>
    Array.from({ length: count }, (_, i) => ({
      setNumber: i + 1,
      weightKg,
      repetitions: 8,
    }));
  const placement = () => plan.days[0].exercises[0];
  const save = (
    entries = sets(1),
    planExerciseId = placement().id,
    alternativeId: string | null = null,
  ) =>
    http().post('/api/v1/me/strength').set(auth(owner.token)).send({
      planExerciseId,
      alternativeId,
      sets: entries,
      note: 'Training note',
    });
  const history = () =>
    http()
      .get(`/api/v1/me/strength/exercises/${placement().exerciseId}`)
      .set(auth(owner.token));

  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(CloudinaryPhotos)
      .useValue({ upload: jest.fn(), remove: jest.fn(), url: jest.fn() })
      .overrideProvider(ResendMail)
      .useValue({ reset: jest.fn(), reminder: jest.fn() })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    await setup(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(PrismaService);
    clock = app.get(CairoClock);
    await db.user.create({
      data: {
        email: emails[0],
        passwordHash: await new ArgonCrypto().hash(password),
        role: 'Coach',
        consentAt: new Date(),
      },
    });
    coachToken = (
      await http()
        .post('/api/v1/auth/login')
        .send({ email: emails[0], password })
        .expect(200)
    ).body.accessToken;
    const fixtures: { id: string; token: string }[] = [];
    for (const email of emails.slice(1)) {
      await http()
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          fullName: 'Strength Client',
          whatsapp: '201000000001',
          consent: true,
        })
        .expect(201);
      const profile = await db.clientProfile.findFirstOrThrow({
        where: { user: { email } },
      });
      const token = (
        await http()
          .post('/api/v1/auth/login')
          .send({ email, password })
          .expect(200)
      ).body.accessToken;
      await http()
        .post(`/api/v1/coach/clients/${profile.id}/activate`)
        .set(auth(coachToken))
        .send({ version: 1, endDate: '2099-01-31', package: 'Monthly' })
        .expect(201);
      fixtures.push({ id: profile.id, token });
    }
    [owner, other] = fixtures;
    const exerciseIds: string[] = [];
    for (const label of ['main', 'alternative', 'unassigned']) {
      exerciseIds.push(
        (
          await http()
            .post('/api/v1/coach/exercises')
            .set(auth(coachToken))
            .send({
              name: `${suffix}-${label}`,
              muscleGroup: 'Legs',
              youtubeVideoId: 'dQw4w9WgXcQ',
            })
            .expect(201)
        ).body.id,
      );
    }
    const input = {
      name: `${suffix}-plan`,
      days: [
        {
          name: 'Day 1',
          order: 0,
          exercises: [0, 1, 2].map((order) => ({
            exerciseId: exerciseIds[order === 2 ? 1 : 0],
            order,
            sets: 3,
            reps: '8-12',
            restSeconds: 90,
            alternatives: order === 2 ? [] : [{ exerciseId: exerciseIds[1] }],
          })),
        },
      ],
    };
    plan = (
      await http()
        .put(`/api/v1/coach/clients/${owner.id}/training`)
        .set(auth(coachToken))
        .send(input)
        .expect(200)
    ).body;
    otherPlan = (
      await http()
        .put(`/api/v1/coach/clients/${other.id}/training`)
        .set(auth(coachToken))
        .send(input)
        .expect(200)
    ).body;
  });
  beforeEach(async () => {
    await db.workoutLog.deleteMany({
      where: { clientId: { in: [owner.id, other.id] } },
    });
    jest.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-20T12:00:00Z'));
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { email: { in: emails } } });
      await db.exercise.deleteMany({ where: { name: { startsWith: suffix } } });
    }
    await app?.close();
  });

  it('saves main/alternative sets and calculations, pages newest-first history, and calculates the overview', async () => {
    const empty = await http()
      .get('/api/v1/me/strength/overview')
      .set(auth(owner.token))
      .expect(200);
    expect(empty.body.items).toHaveLength(2);
    expect(
      empty.body.items.every(
        (e: { latestWeightKg: number | null }) => e.latestWeightKg === null,
      ),
    ).toBe(true);
    const first = await save([
      { setNumber: 1, weightKg: 100, repetitions: 1 },
      { setNumber: 2, weightKg: 90, repetitions: 10 },
    ]).expect(201);
    expect(first.body).toMatchObject({
      exerciseId: placement().exerciseId,
      alternativeId: null,
      note: 'Training note',
      localDate: '2026-11-20',
      heaviestWeightKg: 100,
      estimatedOneRepMaxKg: 120,
      bestSet: { setNumber: 2, weightKg: 90, repetitions: 10 },
    });
    jest.mocked(clock.now).mockReturnValue(new Date('2026-11-20T13:00:00Z'));
    const latest = await save([
      { setNumber: 1, weightKg: 110, repetitions: 6 },
    ]).expect(201);
    const alternative = placement().alternatives[0];
    const altSession = await save(
      sets(1, 50),
      placement().id,
      alternative.id,
    ).expect(201);
    expect(altSession.body).toMatchObject({
      exerciseId: alternative.exerciseId,
      alternativeId: alternative.id,
    });
    const paged = await history().query({ pageSize: 1 }).expect(200);
    expect(paged.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(paged.body.items[0].id).toBe(latest.body.id);
    expect(
      (await history().query({ page: 2, pageSize: 1 }).expect(200)).body
        .items[0].id,
    ).toBe(first.body.id);
    await history().query({ pageSize: 101 }).expect(400);
    const overview = await http()
      .get('/api/v1/me/strength/overview')
      .set(auth(owner.token))
      .expect(200);
    expect(
      overview.body.items.find(
        (e: { exerciseId: string }) => e.exerciseId === placement().exerciseId,
      ),
    ).toMatchObject({
      latestWeightKg: 110,
      bestWeightKg: 110,
      estimatedOneRepMaxKg: 132,
      trendKg: 12,
    });
    expect(
      (
        await http()
          .get(`/api/v1/coach/clients/${owner.id}/strength`)
          .set(auth(coachToken))
          .query({ exerciseId: alternative.exerciseId })
          .expect(200)
      ).body.total,
    ).toBe(1);
  });
  it('scopes all reads and writes to the owner, checks plan/alternative membership and keeps the coach read-only', async () => {
    const session = await save().expect(201);
    const foreign = otherPlan.days[0].exercises[0];
    await save(sets(1), foreign.id).expect(404);
    await save(sets(1), placement().id, foreign.alternatives[0].id).expect(404);
    await save(sets(1), randomUUID()).expect(404);
    await save(sets(1), placement().id, randomUUID()).expect(404);
    const leaked = await http()
      .get(`/api/v1/me/strength/exercises/${placement().exerciseId}`)
      .set(auth(other.token))
      .expect(200);
    expect(leaked.body.items).toEqual([]);
    expect(
      (
        await http()
          .get('/api/v1/me/strength/overview')
          .set(auth(other.token))
          .expect(200)
      ).body.items.every(
        (e: { bestWeightKg: number | null }) => e.bestWeightKg === null,
      ),
    ).toBe(true);
    await http()
      .put(`/api/v1/me/strength/${session.body.id}`)
      .set(auth(other.token))
      .send({ sets: sets(1) })
      .expect(404);
    await http()
      .delete(`/api/v1/me/strength/${session.body.id}`)
      .set(auth(other.token))
      .expect(404);
    await http()
      .get(`/api/v1/coach/clients/${owner.id}/strength`)
      .set(auth(other.token))
      .expect(403);
    await http()
      .put(`/api/v1/me/strength/${session.body.id}`)
      .set(auth(coachToken))
      .send({ sets: sets(1) })
      .expect(403);
    await http()
      .delete(`/api/v1/me/strength/${session.body.id}`)
      .set(auth(coachToken))
      .expect(403);
    await http()
      .post('/api/v1/me/strength')
      .set(auth(coachToken))
      .send({ planExerciseId: placement().id, sets: sets(1) })
      .expect(403);
    await history().expect(200);
    const edited = await http()
      .put(`/api/v1/me/strength/${session.body.id}`)
      .set(auth(owner.token))
      .send({ sets: sets(2, 95), note: 'Edited' })
      .expect(200);
    expect(edited.body).toMatchObject({ note: 'Edited', heaviestWeightKg: 95 });
    expect(edited.body.sets).toHaveLength(2);
    await http()
      .put(`/api/v1/me/strength/${session.body.id}`)
      .set(auth(owner.token))
      .send({ sets: sets(1), clientId: other.id })
      .expect(400);
    await http()
      .delete(`/api/v1/me/strength/${session.body.id}`)
      .set(auth(owner.token))
      .expect(200);
    expect(
      await db.workoutSet.count({ where: { workoutLogId: session.body.id } }),
    ).toBe(0);
    expect((await history().expect(200)).body.total).toBe(0);
  });
  it('rejects invalid numeric limits, duplicate set numbers, empty sets, and excessive notes', async () => {
    const invalid: unknown[] = [
      [],
      sets(11),
      [sets(1)[0], sets(1)[0]],
      [{ setNumber: 0, weightKg: 80, repetitions: 8 }],
      [{ setNumber: 11, weightKg: 80, repetitions: 8 }],
      ...[-0.25, 500.25, 80.1, '80', null].map((weightKg) => [
        { setNumber: 1, weightKg, repetitions: 8 },
      ]),
      ...[0, 101, 1.5, '8', null].map((repetitions) => [
        { setNumber: 1, weightKg: 80, repetitions },
      ]),
    ];
    for (const entries of invalid)
      await http()
        .post('/api/v1/me/strength')
        .set(auth(owner.token))
        .send({ planExerciseId: placement().id, sets: entries })
        .expect(400);
    await http()
      .post('/api/v1/me/strength')
      .set(auth(owner.token))
      .send({
        planExerciseId: placement().id,
        sets: sets(1),
        note: 'x'.repeat(3001),
      })
      .expect(400);
    const boundary = await save([
      { setNumber: 1, weightKg: 0, repetitions: 1 },
      { setNumber: 2, weightKg: 500, repetitions: 100 },
    ]).expect(201);
    await http()
      .put(`/api/v1/me/strength/${boundary.body.id}`)
      .set(auth(owner.token))
      .send({ sets: [{ setNumber: 1, weightKg: 2.1, repetitions: 1 }] })
      .expect(400);
  });
  it('enforces the daily cap across placements, replacements and concurrent saves, and frees deleted sets', async () => {
    const first = await save(sets(6)).expect(201);
    const second = await save(sets(4), plan.days[0].exercises[1].id).expect(
      201,
    );
    expect((await save().expect(409)).body.code).toBe('STRENGTH_SET_LIMIT');
    expect(
      (
        await http()
          .put(`/api/v1/me/strength/${second.body.id}`)
          .set(auth(owner.token))
          .send({ sets: sets(5) })
          .expect(409)
      ).body.code,
    ).toBe('STRENGTH_SET_LIMIT');
    await http()
      .put(`/api/v1/me/strength/${first.body.id}`)
      .set(auth(owner.token))
      .send({ sets: sets(6, 90) })
      .expect(200);
    await save(sets(1), placement().id, placement().alternatives[0].id).expect(
      201,
    );
    await http()
      .delete(`/api/v1/me/strength/${first.body.id}`)
      .set(auth(owner.token))
      .expect(200);
    await save(sets(6)).expect(201);
    await db.workoutLog.deleteMany({ where: { clientId: owner.id } });
    await save(sets(6), placement().id, placement().alternatives[0].id).expect(
      201,
    );
    await save(sets(4), plan.days[0].exercises[2].id).expect(201);
    expect(
      (
        await save(
          sets(1),
          placement().id,
          placement().alternatives[0].id,
        ).expect(409)
      ).body.code,
    ).toBe('STRENGTH_SET_LIMIT');
    await db.workoutLog.deleteMany({ where: { clientId: owner.id } });
    const concurrent = await Promise.all([
      save(sets(6)),
      save(sets(6), plan.days[0].exercises[1].id),
    ]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.workoutSet.count({
        where: { workoutLog: { clientId: owner.id } },
      }),
    ).toBe(6);
  });
  it.each([
    [
      '2026-07-31T20:59:59.999Z',
      '2026-07-31T21:00:00.000Z',
      '2026-07-31',
      '2026-08-01',
    ],
    [
      '2026-01-31T21:59:59.999Z',
      '2026-01-31T22:00:00.000Z',
      '2026-01-31',
      '2026-02-01',
    ],
  ])(
    'resets the cap at Cairo midnight from %s and preserves the original day on edit',
    async (before, after, firstDay, secondDay) => {
      jest.mocked(clock.now).mockReturnValue(new Date(before));
      const first = await save(sets(9)).expect(201);
      expect(first.body.localDate).toBe(firstDay);
      jest.mocked(clock.now).mockReturnValue(new Date(after));
      const second = await save(sets(10)).expect(201);
      expect(second.body.localDate).toBe(secondDay);
      const edited = await http()
        .put(`/api/v1/me/strength/${first.body.id}`)
        .set(auth(owner.token))
        .send({ sets: sets(10) })
        .expect(200);
      expect(edited.body.localDate).toBe(firstDay);
      expect(edited.body.recordedAt).toBe(before);
      await save().expect(409);
    },
  );

  it('returns last sets per actual exercise, keeps alternatives separate, and atomically completes workouts', async () => {
    const read = (token = owner.token) =>
      http().get('/api/v1/me/training').set(auth(token)).expect(200);
    const row = (body: Training) =>
      body.days[0].exercises[0] as Training['days'][0]['exercises'][0] & {
        lastSession?: {
          sets: StrengthSet[];
          recordedAt: string;
          localDate: string;
        };
        bestWeightKg?: number;
        alternatives: { id: string; lastSession?: { sets: StrengthSet[] } }[];
      };
    expect(row((await read()).body).lastSession).toBeUndefined();
    const complete = (body: object, token = owner.token) =>
      http().post('/api/v1/me/workouts').set(auth(token)).send(body);
    const entry = await complete({
      planExerciseId: placement().id,
      sets: sets(1, 92.5),
    }).expect(201);
    expect(await db.workoutLog.count({ where: { clientId: owner.id } })).toBe(
      1,
    );
    expect(
      await db.workoutSet.count({ where: { workoutLogId: entry.body.id } }),
    ).toBe(1);
    let main = row((await read()).body);
    expect(main.lastSession).toMatchObject({
      sets: sets(1, 92.5),
      localDate: '2026-11-20',
      recordedAt: '2026-11-20T12:00:00.000Z',
    });
    expect(main.bestWeightKg).toBe(92.5);
    expect(main.alternatives[0].lastSession).toBeUndefined();
    const alt = placement().alternatives[0];
    jest.mocked(clock.now).mockReturnValue(new Date('2026-11-20T13:00:00Z'));
    await complete({
      planExerciseId: placement().id,
      alternativeId: alt.id,
      sets: sets(1, 40),
    }).expect(201);
    main = row((await read()).body);
    expect(main.lastSession?.sets).toEqual(sets(1, 92.5));
    expect(main.alternatives[0].lastSession?.sets).toEqual(sets(1, 40));
    await complete({ planExerciseId: placement().id }).expect(201);
    expect(row((await read()).body).lastSession?.sets).toEqual(sets(1, 92.5));
    const foreign = row((await read(other.token)).body);
    expect(foreign.lastSession).toBeUndefined();
    expect(foreign.bestWeightKg).toBeUndefined();
    expect(foreign.alternatives[0].lastSession).toBeUndefined();
    await complete(
      { planExerciseId: placement().id, sets: sets(1) },
      other.token,
    ).expect(404);
    await complete({
      planExerciseId: placement().id,
      alternativeId: otherPlan.days[0].exercises[0].alternatives[0].id,
      sets: sets(1),
    }).expect(404);
    for (const invalid of [
      [],
      null,
      sets(11),
      sets(1, 92.6),
      [{ setNumber: 1, weightKg: 20, repetitions: 101 }],
    ])
      await complete({ planExerciseId: placement().id, sets: invalid }).expect(
        400,
      );
    await complete({ planExerciseId: placement().id, sets: sets(9) }).expect(
      201,
    );
    const before = await db.workoutLog.count({ where: { clientId: owner.id } });
    expect(
      (
        await complete({
          planExerciseId: placement().id,
          sets: sets(1),
        }).expect(409)
      ).body.code,
    ).toBe('STRENGTH_SET_LIMIT');
    expect(await db.workoutLog.count({ where: { clientId: owner.id } })).toBe(
      before,
    );
    await complete({ planExerciseId: placement().id }).expect(201);
  });
  it.each(['Pending', 'Expired', 'Deactivated'] as const)(
    'refuses training reads and both completion modes for %s clients',
    async (status) => {
      try {
        await db.clientProfile.update({
          where: { id: other.id },
          data: {
            status: status === 'Expired' ? 'Active' : status,
            accessEndAt: status === 'Pending' ? null : new Date('2020-01-01'),
          },
        });
        expect(
          (
            await http()
              .get('/api/v1/me/training')
              .set(auth(other.token))
              .expect(403)
          ).body.code,
        ).toBe('ACCESS_INACTIVE');
        for (const extra of [{}, { sets: sets(1) }]) {
          const denied = await http()
            .post('/api/v1/me/workouts')
            .set(auth(other.token))
            .send({
              planExerciseId: otherPlan.days[0].exercises[0].id,
              ...extra,
            })
            .expect(403);
          expect(denied.body.code).toBe('ACCESS_INACTIVE');
        }
      } finally {
        await db.clientProfile.update({
          where: { id: other.id },
          data: { status: 'Active', accessEndAt: new Date('2099-01-31') },
        });
      }
    },
  );

  it('keeps existing choice locks and includes sets/notes in exports with cascading data deletion', async () => {
    await http()
      .put(`/api/v1/coach/clients/${owner.id}/training/lock`)
      .set(auth(coachToken))
      .send({ version: plan.version, locked: true })
      .expect(200);
    const blocked = await save(
      sets(1),
      placement().id,
      placement().alternatives[0].id,
    ).expect(403);
    expect(blocked.body.code).toBe('CHOICE_LOCKED');
    const session = await save().expect(201);
    await db.clientProfile.update({
      where: { id: owner.id },
      data: { status: 'Deactivated' },
    });
    const exported = await http()
      .get('/api/v1/me/export')
      .set(auth(owner.token))
      .expect(200);
    expect(exported.body.strength).toHaveLength(1);
    expect(exported.body.strength[0]).toMatchObject({
      id: session.body.id,
      note: 'Training note',
      sets: sets(1),
    });
    const coachHistory = await http()
      .get(`/api/v1/coach/clients/${owner.id}/strength`)
      .set(auth(coachToken))
      .expect(200);
    expect(coachHistory.body.total).toBe(1);
    await http().delete('/api/v1/me').set(auth(owner.token)).expect(200);
    expect(await db.workoutLog.count({ where: { clientId: owner.id } })).toBe(
      0,
    );
    expect(
      await db.workoutSet.count({ where: { workoutLogId: session.body.id } }),
    ).toBe(0);
  });
});

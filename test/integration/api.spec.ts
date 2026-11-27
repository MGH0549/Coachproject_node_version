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
import { CloudinaryPhotos } from '../../src/infrastructure/cloudinary/cloudinary-photos';
import { ResendMail } from '../../src/infrastructure/email/resend-mail';
import { setup } from '../../src/api/setup';
import { Diet, Training } from '../../src/domain/models';

// Intentionally refuse to run against a database that is not explicitly marked for tests.
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

describe('PostgreSQL API integration', () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let coachToken: string;
  let clientToken: string;
  let otherToken: string;
  let clientId: string;
  let otherId: string;
  let training: Training;
  let diet: Diet;
  const password = 'IntegrationPassword123';
  const suffix = randomUUID();
  const email = `client-${suffix}@example.com`;
  const otherEmail = `other-${suffix}@example.com`;
  const coachEmail = `coach-${suffix}@example.com`;
  const flowEmails: string[] = [];
  const accountFields = [
    'fullName',
    'email',
    'status',
    'accessEndsAt',
    'whatsapp',
    'activatedAt',
    'createdAt',
    'package',
    'timeZone',
    'whatsappUrl',
  ];
  const photoAdapter = {
    upload: jest.fn(async () => `progress/${suffix}/photo`),
    remove: jest.fn(async () => {}),
    url: jest.fn(() => 'https://example.com/signed-private-photo'),
  };
  const resetCalls: { email: string; token: string }[] = [];
  const mail = {
    reset: jest.fn(async (email: string, token: string) => {
      resetCalls.push({ email, token });
    }),
    reminder: jest.fn(async () => {}),
  };
  const client = () => request(app.getHttpServer());
  const asCoach = () => ({ Authorization: `Bearer ${coachToken}` });
  const asClient = () => ({ Authorization: `Bearer ${clientToken}` });
  async function registerAndLogin(label: string) {
    const address = `${label}-${suffix}@example.com`;
    flowEmails.push(address);
    const registered = await client()
      .post('/api/v1/auth/register')
      .send({
        email: address,
        password,
        fullName: 'New Client',
        whatsapp: '201000000001',
        consent: true,
      })
      .expect(201);
    expect(Object.keys(registered.body).sort()).toEqual([
      'id',
      'status',
      'whatsappUrl',
    ]);
    expect(registered.headers['set-cookie']).toBeUndefined();
    const user = await db.user.findUniqueOrThrow({ where: { email: address } });
    expect(await db.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    const login = await client()
      .post('/api/v1/auth/login')
      .send({ email: address, password })
      .expect(200);
    const profile = await db.clientProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    return {
      id: profile.id,
      token: login.body.accessToken as string,
      email: address,
    };
  }
  beforeAll(async () => {
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(CloudinaryPhotos)
      .useValue(photoAdapter)
      .overrideProvider(ResendMail)
      .useValue(mail)
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: 256 * 1024 }),
      { logger: false },
    );
    await setup(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(PrismaService);
    await db.user.create({
      data: {
        email: coachEmail,
        passwordHash: await new ArgonCrypto().hash(password),
        role: 'Coach',
        consentAt: new Date(),
      },
    });
    const login = await client()
      .post('/api/v1/auth/login')
      .send({ email: coachEmail, password })
      .expect(200);
    coachToken = login.body.accessToken;
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({
        where: {
          email: { in: [email, otherEmail, coachEmail, ...flowEmails] },
        },
      });
      // Test-created templates/exercises have a unique prefix; never truncate shared tables.
      await db.trainingPlan.deleteMany({
        where: { name: { startsWith: suffix } },
      });
      await db.dietPlan.deleteMany({ where: { name: { startsWith: suffix } } });
      await db.exercise.deleteMany({ where: { name: { startsWith: suffix } } });
    }
    await app?.close();
  });
  it('registers pending clients with consent, hides credentials and forbids mass assignment', async () => {
    const shortPassword = 'Short1234';
    const invalid = await client()
      .post('/api/v1/auth/register')
      .send({
        email,
        password: shortPassword,
        fullName: 'عميل',
        whatsapp: '201000000001',
        consent: true,
      })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');
    expect(invalid.body.errors).toEqual([
      {
        field: 'password',
        messages: ['كلمة المرور يجب أن تكون من 12 إلى 128 حرفاً'],
      },
    ]);
    expect(JSON.stringify(invalid.body)).not.toContain(shortPassword);
    expect(JSON.stringify(invalid.body)).not.toContain(email);
    await client()
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        fullName: 'عميل',
        whatsapp: '201000000001',
        consent: false,
      })
      .expect(400);
    await client()
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        fullName: 'عميل',
        whatsapp: '201000000001',
        consent: true,
        role: 'Coach',
      })
      .expect(400);
    for (const address of [email, otherEmail]) {
      const response = await client()
        .post('/api/v1/auth/register')
        .send({
          email: address,
          password,
          fullName: 'عميل',
          whatsapp: '201000000001',
          consent: true,
        })
        .expect(201);
      expect(response.body).toMatchObject({
        status: 'Pending',
        whatsappUrl: expect.stringContaining('https://wa.me/'),
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(Object.keys(response.body).sort()).toEqual([
        'id',
        'status',
        'whatsappUrl',
      ]);
      const user = await db.user.findUniqueOrThrow({
        where: { email: address },
      });
      expect(await db.refreshToken.count({ where: { userId: user.id } })).toBe(
        0,
      );
      const profile = await db.clientProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      if (address === email) clientId = profile.id;
      else otherId = profile.id;
    }
    clientToken = (
      await client()
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200)
    ).body.accessToken;
    otherToken = (
      await client()
        .post('/api/v1/auth/login')
        .send({ email: otherEmail, password })
        .expect(200)
    ).body.accessToken;
    const account = await client()
      .get('/api/v1/me')
      .set(asClient())
      .expect(200);
    expect(account.body.status).toBe('Pending');
    expect(Object.keys(account.body).sort()).toEqual([...accountFields].sort());
    expect(JSON.stringify(account.body)).not.toMatch(
      /passwordHash|refreshToken|failedLogins/,
    );
    await client().get('/api/v1/me/training').set(asClient()).expect(403);
    await client().get('/api/v1/coach/clients').set(asClient()).expect(403);
    await client().get('/api/v1/me').expect(401);
  });
  it('enforces activation, Cairo date end, immediate deactivation and optimistic versioning', async () => {
    const activated = await client()
      .post(`/api/v1/coach/clients/${clientId}/activate`)
      .set(asCoach())
      .send({ version: 1, endDate: '2099-01-31', package: 'شهري' })
      .expect(201);
    expect(activated.body.accessEndAt).toBe('2099-01-31T21:59:59.999Z');
    await client()
      .post(`/api/v1/coach/clients/${clientId}/extend`)
      .set(asCoach())
      .send({ version: 1, endDate: '2099-02-28' })
      .expect(409);
    await client()
      .post(`/api/v1/coach/clients/${clientId}/deactivate`)
      .set(asCoach())
      .send({ version: 2 })
      .expect(201);
    await client().get('/api/v1/me/diet').set(asClient()).expect(403);
    await client()
      .post(`/api/v1/coach/clients/${clientId}/activate`)
      .set(asCoach())
      .send({ version: 3, endDate: '2099-01-31', package: 'شهري' })
      .expect(201);
    await client()
      .post(`/api/v1/coach/clients/${otherId}/activate`)
      .set(asCoach())
      .send({ version: 1, endDate: '2099-01-31', package: 'شهري' })
      .expect(201);
  });
  it.each(['Pending', 'Expired', 'Deactivated'] as const)(
    'allows the %s account but refuses every guarded client endpoint with ACCESS_INACTIVE',
    async (status) => {
      const fixture = await registerAndLogin(status.toLowerCase());
      const end = new Date(Date.now() - 86400000);
      await db.clientProfile.update({
        where: { id: fixture.id },
        data: {
          status: status === 'Expired' ? 'Active' : status,
          accessEndAt: status === 'Pending' ? null : end,
          deactivatedAt: status === 'Deactivated' ? end : null,
          reminderSentFor: end,
        },
      });
      const account = await client()
        .get('/api/v1/me')
        .auth(fixture.token, { type: 'bearer' })
        .expect(200);
      expect(Object.keys(account.body).sort()).toEqual(
        [...accountFields].sort(),
      );
      expect(account.body).toEqual({
        whatsapp: expect.any(String),
        activatedAt: null,
        createdAt: expect.any(String),
        fullName: 'New Client',
        email: fixture.email,
        status,
        accessEndsAt: status === 'Pending' ? null : end.toISOString(),
        package: null,
        timeZone: 'Africa/Cairo',
        whatsappUrl: expect.stringContaining('https://wa.me/'),
      });
      const id = randomUUID();
      const routes: ['get' | 'post' | 'put' | 'delete', string][] = [
        ['get', 'training'],
        ['get', 'diet'],
        ['get', 'progress'],
        ['get', 'workouts'],
        ['post', 'check-ins'],
        ['post', 'workouts'],
        ['put', `training/exercises/${id}/selection`],
        ['put', `diet/meals/${id}/selection`],
        ['post', `check-ins/${id}/photos`],
        ['get', `photos/${id}`],
        ['delete', `photos/${id}`],
        ['post', 'strength'],
        ['put', `strength/${id}`],
        ['delete', `strength/${id}`],
        ['get', `strength/exercises/${id}`],
        ['get', 'strength/overview'],
      ];
      for (const [method, route] of routes) {
        const agent = client();
        const refused = await agent[method](`/api/v1/me/${route}`)
          .auth(fixture.token, { type: 'bearer' })
          .expect(403);
        expect(refused.body.code).toBe('ACCESS_INACTIVE');
      }
    },
  );
  it('registers, logs in immediately, shows Pending, then unlocks plans after coach activation with the same login', async () => {
    const fixture = await registerAndLogin('dashboard');
    const auth = { Authorization: `Bearer ${fixture.token}` };
    const account = await client().get('/api/v1/me').set(auth).expect(200);
    expect(account.body.status).toBe('Pending');
    const trainingPlan = await client()
      .put(`/api/v1/coach/clients/${fixture.id}/training`)
      .set(asCoach())
      .send({
        name: `${suffix}-dashboard-training`,
        days: [{ name: 'Day 1', order: 0, exercises: [] }],
      })
      .expect(200);
    const macros = { calories: 500, protein: 30, carbs: 50, fat: 20 };
    const dietPlan = await client()
      .put(`/api/v1/coach/clients/${fixture.id}/diet`)
      .set(asCoach())
      .send({
        name: `${suffix}-dashboard-diet`,
        ...macros,
        meals: [
          {
            name: 'Breakfast',
            order: 0,
            options: ['A', 'B'].map((name) => ({
              name,
              ...macros,
              items: [{ food: 'Rice', quantity: 100, unit: 'g' }],
            })),
          },
        ],
      })
      .expect(200);
    for (const route of ['training', 'diet', 'progress', 'workouts']) {
      const refused = await client()
        .get(`/api/v1/me/${route}`)
        .set(auth)
        .expect(403);
      expect(refused.body.code).toBe('ACCESS_INACTIVE');
    }
    const refusedCheckIn = await client()
      .post('/api/v1/me/check-ins')
      .set(auth)
      .send({ weight: 80, measurements: {}, energy: 7 })
      .expect(403);
    expect(refusedCheckIn.body.code).toBe('ACCESS_INACTIVE');
    await client()
      .post(`/api/v1/coach/clients/${fixture.id}/activate`)
      .set(asCoach())
      .send({
        version: 1,
        endDate: '2099-01-31',
        package: 'Monthly',
      })
      .expect(201);
    expect(
      (await client().get('/api/v1/me/training').set(auth).expect(200)).body.id,
    ).toBe(trainingPlan.body.id);
    expect(
      (await client().get('/api/v1/me/diet').set(auth).expect(200)).body.id,
    ).toBe(dietPlan.body.id);
    for (const route of ['progress', 'workouts'])
      await client().get(`/api/v1/me/${route}`).set(auth).expect(200);
    await client()
      .post('/api/v1/me/check-ins')
      .set(auth)
      .send({ weight: 80, measurements: {}, energy: 7 })
      .expect(201);
    const activated = await client().get('/api/v1/me').set(auth).expect(200);
    expect(Object.keys(activated.body).sort()).toEqual(
      [...accountFields].sort(),
    );
    expect(activated.body).toMatchObject({
      status: 'Active',
      package: 'Monthly',
      accessEndsAt: '2099-01-31T21:59:59.999Z',
    });
  });
  it('builds training alternatives, protects ownership and blocks deletion of in-use exercises', async () => {
    const exercises: string[] = [];
    for (const n of [1, 2])
      exercises.push(
        (
          await client()
            .post('/api/v1/coach/exercises')
            .set(asCoach())
            .send({
              name: `${suffix}-${n}`,
              muscleGroup: 'صدر',
              youtubeVideoId: 'dQw4w9WgXcQ',
            })
            .expect(201)
        ).body.id,
      );
    const input = {
      name: `${suffix}-training`,
      days: [
        {
          name: 'دفع',
          order: 0,
          exercises: [
            {
              exerciseId: exercises[0],
              sets: 3,
              reps: '8-12',
              restSeconds: 90,
              order: 0,
              alternatives: [{ exerciseId: exercises[1], sets: 4 }],
            },
          ],
        },
      ],
    };
    training = (
      await client()
        .put(`/api/v1/coach/clients/${clientId}/training`)
        .set(asCoach())
        .send(input)
        .expect(200)
    ).body;
    const otherPlan = (
      await client()
        .put(`/api/v1/coach/clients/${otherId}/training`)
        .set(asCoach())
        .send(input)
        .expect(200)
    ).body as Training;
    const placement = training.days[0].exercises[0];
    const foreign = otherPlan.days[0].exercises[0];
    await client()
      .put(`/api/v1/me/training/exercises/${foreign.id}/selection`)
      .set(asClient())
      .send({
        version: training.version,
        alternativeId: foreign.alternatives[0].id,
      })
      .expect(404);
    training = (
      await client()
        .put(`/api/v1/me/training/exercises/${placement.id}/selection`)
        .set(asClient())
        .send({
          version: training.version,
          alternativeId: placement.alternatives[0].id,
        })
        .expect(200)
    ).body;
    training = (
      await client()
        .put(`/api/v1/coach/clients/${clientId}/training/lock`)
        .set(asCoach())
        .send({ version: training.version, locked: true })
        .expect(200)
    ).body;
    await client()
      .put(`/api/v1/me/training/exercises/${placement.id}/selection`)
      .set(asClient())
      .send({ version: training.version, alternativeId: null })
      .expect(403);
    await client()
      .post('/api/v1/me/workouts')
      .set(asClient())
      .send({ planExerciseId: placement.id, alternativeId: null })
      .expect(403);
    const workout = await client()
      .post('/api/v1/me/workouts')
      .set(asClient())
      .send({
        planExerciseId: placement.id,
        alternativeId: placement.alternatives[0].id,
      })
      .expect(201);
    expect(workout.body.sets).toBe(4);
    await client()
      .post('/api/v1/me/workouts')
      .set(asClient())
      .send({ planExerciseId: foreign.id })
      .expect(404);
    await client()
      .delete(`/api/v1/coach/exercises/${exercises[0]}`)
      .set(asCoach())
      .send({ version: 1 })
      .expect(409);
    const template = await client()
      .post('/api/v1/coach/templates/training')
      .set(asCoach())
      .send({ ...input, name: `${suffix}-template` })
      .expect(201);
    const copy = await client()
      .post(`/api/v1/coach/templates/training/${template.body.id}/copy`)
      .set(asCoach())
      .send({ clientId, version: training.version })
      .expect(201);
    expect(copy.body.days[0].id).not.toBe(template.body.days[0].id);
    expect(copy.body.isTemplate).toBe(false);
  });
  it('saves meal choices, calculates totals and enforces per-meal and whole-diet locks', async () => {
    const option = (name: string, calories: number) => ({
      name,
      calories,
      protein: 30,
      carbs: 40,
      fat: 15,
      items: [{ food: 'أرز', quantity: 100, unit: 'جرام' }],
    });
    const input = {
      name: `${suffix}-diet`,
      calories: 2000,
      protein: 120,
      carbs: 200,
      fat: 60,
      meals: [
        {
          name: 'فطور',
          order: 0,
          options: [option('أ', 400), option('ب', 500)],
        },
      ],
    };
    diet = (
      await client()
        .put(`/api/v1/coach/clients/${clientId}/diet`)
        .set(asCoach())
        .send(input)
        .expect(200)
    ).body;
    const foreign = (
      await client()
        .put(`/api/v1/coach/clients/${otherId}/diet`)
        .set(asCoach())
        .send(input)
        .expect(200)
    ).body as Diet;
    await client()
      .put(`/api/v1/me/diet/meals/${foreign.meals[0].id}/selection`)
      .set(asClient())
      .send({ version: diet.version, optionId: foreign.meals[0].options[0].id })
      .expect(404);
    const meal = diet.meals[0];
    diet = (
      await client()
        .put(`/api/v1/me/diet/meals/${meal.id}/selection`)
        .set(asClient())
        .send({ version: diet.version, optionId: meal.options[1].id })
        .expect(200)
    ).body;
    expect(
      (await client().get('/api/v1/me/diet').set(asClient()).expect(200)).body
        .selectedTotals.calories,
    ).toBe(500);
    diet = (
      await client()
        .put(
          `/api/v1/coach/clients/${clientId}/diet/meals/${meal.id}/selection`,
        )
        .set(asCoach())
        .send({
          version: diet.version,
          optionId: meal.options[1].id,
          locked: true,
        })
        .expect(200)
    ).body;
    await client()
      .put(`/api/v1/me/diet/meals/${meal.id}/selection`)
      .set(asClient())
      .send({ version: diet.version, optionId: meal.options[0].id })
      .expect(403);
    diet = (
      await client()
        .put(`/api/v1/coach/clients/${clientId}/diet/lock`)
        .set(asCoach())
        .send({ version: diet.version, locked: true })
        .expect(200)
    ).body;
    await client()
      .put(`/api/v1/me/diet/meals/${meal.id}/selection`)
      .set(asClient())
      .send({ version: diet.version, optionId: meal.options[1].id })
      .expect(403);
  });
  it('stores check-ins separately from photo uploads and isolates progress, photos and feedback', async () => {
    const check = await client()
      .post('/api/v1/me/check-ins')
      .set(asClient())
      .send({
        weight: 80,
        measurements: { waist: 85 },
        energy: 7,
        notes: 'جيد',
      })
      .expect(201);
    const otherCheck = await client()
      .post('/api/v1/me/check-ins')
      .auth(otherToken, { type: 'bearer' })
      .send({ weight: 90, measurements: { waist: 90 }, energy: 6 })
      .expect(201);
    expect(check.body.recordedAt).toMatch(/Z$/);
    expect(check.body.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await client()
      .post(`/api/v1/me/check-ins/${otherCheck.body.id}/photos`)
      .set(asClient())
      .attach('photo', Buffer.from('test'), 'photo.jpg')
      .expect(404);
    const photo = await client()
      .post(`/api/v1/me/check-ins/${check.body.id}/photos`)
      .set(asClient())
      .attach('photo', Buffer.from('test'), 'photo.jpg')
      .expect(201);
    await client()
      .get(`/api/v1/me/photos/${photo.body.id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await client()
      .get(`/api/v1/coach/clients/${otherId}/photos/${photo.body.id}`)
      .set(asCoach())
      .expect(404);
    await client()
      .put(
        `/api/v1/coach/clients/${otherId}/check-ins/${check.body.id}/feedback`,
      )
      .set(asCoach())
      .send({ version: 1, feedback: 'ممتاز' })
      .expect(409);
    await client()
      .put(
        `/api/v1/coach/clients/${clientId}/check-ins/${check.body.id}/feedback`,
      )
      .set(asCoach())
      .send({ version: 1, feedback: 'ممتاز' })
      .expect(200);
    const progress = await client()
      .get('/api/v1/me/progress')
      .set(asClient())
      .expect(200);
    expect(progress.body.items.map((x: { id: string }) => x.id)).not.toContain(
      otherCheck.body.id,
    );
    expect(progress.body.items[0].feedback).toBe('ممتاز');
    photoAdapter.upload.mockRejectedValueOnce(new Error('cloud unavailable'));
    await client()
      .post(`/api/v1/me/check-ins/${check.body.id}/photos`)
      .set(asClient())
      .attach('photo', Buffer.from('test'), 'photo.jpg')
      .expect(503);
    expect(await db.checkIn.count({ where: { id: check.body.id } })).toBe(1);
    await client()
      .delete(`/api/v1/me/photos/${photo.body.id}`)
      .set(asClient())
      .expect(200);
  });
  it('checks expiration on every protected request and keeps privacy tools accessible', async () => {
    await db.clientProfile.update({
      where: { id: clientId },
      data: { accessEndAt: new Date(Date.now() - 1000) },
    });
    for (const route of ['training', 'diet', 'progress', 'workouts'])
      await client().get(`/api/v1/me/${route}`).set(asClient()).expect(403);
    expect(
      (await client().get('/api/v1/me').set(asClient()).expect(200)).body
        .status,
    ).toBe('Expired');
    const exported = await client()
      .get('/api/v1/me/export')
      .set(asClient())
      .expect(200);
    expect(JSON.stringify(exported.body)).not.toMatch(
      /passwordHash|tokenHash|publicId/,
    );
    await client()
      .get('/api/v1/coach/clients?pageSize=101')
      .set(asCoach())
      .expect(400);
  });
  it('rotates refresh cookies, detects replay, protects cookie origins, and logs out the family', async () => {
    const login = await client()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const initial = login.headers['set-cookie'][0].split(';')[0];
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(login.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
    expect(login.body.refreshToken).toBeUndefined();
    await client()
      .post('/api/v1/auth/refresh')
      .set('Cookie', initial)
      .set('Origin', 'https://attacker.example')
      .expect(403);
    const refreshed = await client()
      .post('/api/v1/auth/refresh')
      .set('Cookie', initial)
      .set('Origin', process.env.APP_ORIGIN!)
      .expect(200);
    const next = refreshed.headers['set-cookie'][0].split(';')[0];
    await client()
      .post('/api/v1/auth/refresh')
      .set('Cookie', initial)
      .set('Origin', process.env.APP_ORIGIN!)
      .expect(401);
    await client()
      .post('/api/v1/auth/refresh')
      .set('Cookie', next)
      .set('Origin', process.env.APP_ORIGIN!)
      .expect(401);
    const another = await client()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = another.headers['set-cookie'][0].split(';')[0];
    await client()
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', process.env.APP_ORIGIN!)
      .expect(200);
    await client()
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', process.env.APP_ORIGIN!)
      .expect(401);
  });
  it('does not enumerate password recovery, consumes reset tokens once and revokes sessions', async () => {
    const unknown = await client()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(200);
    const known = await client()
      .post('/api/v1/auth/forgot-password')
      .send({ email })
      .expect(200);
    expect(known.body).toEqual(unknown.body);
    const token = resetCalls[0]?.token;
    expect(token).toBeDefined();
    await client()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'ChangedPassword123' })
      .expect(200);
    await client()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'ChangedPassword456' })
      .expect(400);
    await client()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(401);
    await client()
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangedPassword123' })
      .expect(200);
  });
  it('locks repeated failed sign-ins and permits explicit data deletion', async () => {
    for (let i = 0; i < 5; i++)
      await client()
        .post('/api/v1/auth/login')
        .send({ email: otherEmail, password: 'wrong-password' })
        .expect(401);
    await client()
      .post('/api/v1/auth/login')
      .send({ email: otherEmail, password })
      .expect(429);
    await client()
      .delete('/api/v1/me')
      .auth(otherToken, { type: 'bearer' })
      .expect(200);
    await client()
      .get('/api/v1/me')
      .auth(otherToken, { type: 'bearer' })
      .expect(401);
    expect(await db.checkIn.count({ where: { clientId: otherId } })).toBe(0);
    await client().get('/api/v1/health').expect(200);
  });
  it('allows local Swagger and frontend origins while rejecting untrusted origins', async () => {
    const localOrigin = `http://localhost:${process.env.PORT ?? 3000}`;
    for (const origin of [localOrigin, process.env.APP_ORIGIN!]) {
      const preflight = await client()
        .options('/api/v1/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type')
        .expect(204);
      expect(preflight.headers['access-control-allow-origin']).toBe(origin);
      expect(preflight.headers['access-control-allow-credentials']).toBe(
        'true',
      );
      const response = await client()
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email: 'invalid', password: 'x' })
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    }
    const rejected = await client()
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'invalid', password: 'x' })
      .expect(403);
    expect(rejected.body.code).toBe('ORIGIN_FORBIDDEN');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('serves response schemas and applies real HTTP rate limits and security headers', async () => {
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CloudinaryPhotos)
      .useValue(photoAdapter)
      .overrideProvider(ResendMail)
      .useValue(mail)
      .compile();
    const secured = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    );
    try {
      await setup(secured);
      await secured.init();
      await secured.getHttpAdapter().getInstance().ready();
      const agent = request(secured.getHttpServer());
      const docs = await agent.get('/api/docs-json').expect(200);
      const accountSchema = docs.body.components.schemas.Account;
      expect(Object.keys(accountSchema.properties).sort()).toEqual(
        [...accountFields].sort(),
      );
      expect([...accountSchema.required].sort()).toEqual(
        [...accountFields].sort(),
      );
      expect(accountSchema.additionalProperties).toBe(false);
      expect(
        docs.body.paths['/api/v1/me'].get.responses['200'].content[
          'application/json'
        ].schema.$ref,
      ).toBe('#/components/schemas/Account');
      expect(
        docs.body.paths['/api/v1/coach/clients/{clientId}'].get.responses['200']
          .content['application/json'].schema.$ref,
      ).toBe('#/components/schemas/CoachAccount');
      expect(
        docs.body.components.schemas.StrengthSet.properties.weightKg,
      ).toMatchObject({ minimum: 0, maximum: 500, multipleOf: 0.25 });
      expect(
        docs.body.components.schemas.StrengthSession.properties
          .estimatedOneRepMaxKg,
      ).toEqual({ type: 'number' });
      expect(
        docs.body.components.schemas.Export.properties.strength.items.$ref,
      ).toBe('#/components/schemas/StrengthExportSession');
      for (const [path, method, status, schema] of [
        ['/api/v1/me/strength', 'post', '201', 'StrengthSession'],
        ['/api/v1/me/strength/{id}', 'put', '200', 'StrengthSession'],
        ['/api/v1/me/strength/{id}', 'delete', '200', 'Message'],
        [
          '/api/v1/me/strength/exercises/{exerciseId}',
          'get',
          '200',
          'StrengthPage',
        ],
        ['/api/v1/me/strength/overview', 'get', '200', 'StrengthOverview'],
        [
          '/api/v1/coach/clients/{clientId}/strength',
          'get',
          '200',
          'StrengthPage',
        ],
      ])
        expect(
          docs.body.paths[path][method].responses[status].content[
            'application/json'
          ].schema.$ref,
        ).toBe(`#/components/schemas/${schema}`);
      expect(
        docs.body.components.schemas.Training.properties.days,
      ).toBeDefined();
      expect(
        docs.body.paths['/api/v1/me/training'].get.responses['200'].content[
          'application/json'
        ].schema.$ref,
      ).toBe('#/components/schemas/Training');
      const health = await agent.get('/api/v1/health').expect(200);
      expect(health.headers['x-frame-options']).toBe('DENY');
      expect(health.headers['x-content-type-options']).toBe('nosniff');
      expect(health.headers['cache-control']).toBe('no-store');
      for (let n = 0; n < 10; n++)
        await agent
          .post('/api/v1/auth/login')
          .send({ email: 'invalid', password: 'x' })
          .expect(400);
      const limited = await agent
        .post('/api/v1/auth/login')
        .send({ email: 'invalid', password: 'x' })
        .expect(429);
      expect(limited.body.code).toBe('RATE_LIMITED');
    } finally {
      await secured.close();
    }
  });
});

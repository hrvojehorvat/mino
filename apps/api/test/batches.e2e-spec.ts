import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { bearer, signupAndAuthenticate } from './support/auth.js';

const sessionPayload = (batchId: string) => ({
  batchId,
  testType: 'fingerTapping',
  startedAt: '2026-09-02T22:00:00.000Z',
  endedAt: '2026-09-02T22:00:10.000Z',
  clientAppVersion: '0.1.0',
  deviceMetadata: { os: 'iOS', osVersion: '17.5', model: 'iPhone15,2' },
  events: [
    { seq: 0, eventType: 'touchDown', tMs: 100, x: 10, y: 20, pointerId: 0 },
    { seq: 1, eventType: 'touchUp', tMs: 180, x: 10, y: 20, pointerId: 0 },
  ],
});

describe('BatchesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.baselineResult.deleteMany();
    await prisma.mLResult.deleteMany();
    await prisma.rawEvent.deleteMany();
    await prisma.sensorSession.deleteMany();
    await prisma.testSession.deleteMany();
    await prisma.testBatch.deleteMany();
    await prisma.user.deleteMany();

    ({ token } = await signupAndAuthenticate(app));
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a batch (POST /batches)', async () => {
    const response = await request(app.getHttpServer())
      .post('/batches')
      .set(bearer(token))
      .send({ name: 'Morning check-in' })
      .expect(201);

    expect(response.body.id).toEqual(expect.any(String));

    const batch = await prisma.testBatch.findUnique({
      where: { id: response.body.id },
    });
    expect(batch).toMatchObject({ name: 'Morning check-in' });
  });

  it('creates a batch without a name', async () => {
    const response = await request(app.getHttpServer())
      .post('/batches')
      .set(bearer(token))
      .send({})
      .expect(201);

    const batch = await prisma.testBatch.findUnique({
      where: { id: response.body.id },
    });
    expect(batch?.name).toBeNull();
  });

  it('rejects requests with no bearer token (401)', async () => {
    await request(app.getHttpServer()).post('/batches').send({}).expect(401);
  });

  it('lists batches for a user with their session counts, newest first (GET /batches)', async () => {
    const firstBatch = await request(app.getHttpServer())
      .post('/batches')
      .set(bearer(token))
      .send({ name: 'First batch' })
      .expect(201);
    const secondBatch = await request(app.getHttpServer())
      .post('/batches')
      .set(bearer(token))
      .send({ name: 'Second batch' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/sessions')
      .set(bearer(token))
      .send(sessionPayload(secondBatch.body.id))
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/batches')
      .set(bearer(token))
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: secondBatch.body.id,
        name: 'Second batch',
        sessionCount: 1,
      }),
      expect.objectContaining({
        id: firstBatch.body.id,
        name: 'First batch',
        sessionCount: 0,
      }),
    ]);
  });

  it('returns an empty list for a user with no batches', async () => {
    const response = await request(app.getHttpServer())
      .get('/batches')
      .set(bearer(token))
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('rejects a session submission whose batchId does not exist (400)', async () => {
    await request(app.getHttpServer())
      .post('/sessions')
      .set(bearer(token))
      .send(sessionPayload('does-not-exist'))
      .expect(400);
  });

  it('computes a pending result on demand instead of only relying on the background sweep (GET /batches/:id)', async () => {
    const batch = await request(app.getHttpServer())
      .post('/batches')
      .set(bearer(token))
      .send({ name: 'Morning check-in' })
      .expect(201);

    const session = await request(app.getHttpServer())
      .post('/sessions')
      .set(bearer(token))
      .send(sessionPayload(batch.body.id))
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/batches/${batch.body.id}`)
      .set(bearer(token))
      .expect(200);

    expect(response.body).toMatchObject({
      id: batch.body.id,
      name: 'Morning check-in',
      sessions: [
        {
          id: session.body.id,
          testType: 'fingerTapping',
          status: 'Completed',
          mlResult: {
            modelId: 'signal-features',
            modelVersion: '2',
          },
        },
      ],
    });
    expect(response.body.sessions[0].mlResult.metrics).toBeDefined();
  });

  it('includes the mlResult once services/ml has computed one (GET /batches/:id)', async () => {
    const batch = await request(app.getHttpServer())
      .post('/batches')
      .set(bearer(token))
      .send({})
      .expect(201);

    const session = await request(app.getHttpServer())
      .post('/sessions')
      .set(bearer(token))
      .send(sessionPayload(batch.body.id))
      .expect(201);

    await prisma.mLResult.create({
      data: {
        sessionId: session.body.id,
        modelId: 'signal-features',
        modelVersion: '2',
        metrics: { meanIntervalMs: 133.4 },
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/batches/${batch.body.id}`)
      .set(bearer(token))
      .expect(200);

    expect(response.body.sessions[0].mlResult).toMatchObject({
      modelId: 'signal-features',
      modelVersion: '2',
      metrics: { meanIntervalMs: 133.4 },
    });
  });

  it('returns 404 for an unknown batch id (GET /batches/:id)', async () => {
    await request(app.getHttpServer())
      .get('/batches/does-not-exist')
      .set(bearer(token))
      .expect(404);
  });

  it('returns 404 for a batch belonging to a different user (GET /batches/:id)', async () => {
    const batch = await request(app.getHttpServer())
      .post('/batches')
      .set(bearer(token))
      .send({})
      .expect(201);

    const other = await signupAndAuthenticate(app);
    await request(app.getHttpServer())
      .get(`/batches/${batch.body.id}`)
      .set(bearer(other.token))
      .expect(404);
  });
});

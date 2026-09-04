import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const deviceId = '22222222-2222-4222-8222-222222222222';

const sessionPayload = (batchId: string) => ({
  deviceId,
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
    await prisma.mLResult.deleteMany();
    await prisma.rawEvent.deleteMany();
    await prisma.sensorSession.deleteMany();
    await prisma.testSession.deleteMany();
    await prisma.testBatch.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a batch (POST /batches)', async () => {
    const response = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId, name: 'Morning check-in' })
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
      .send({ deviceId })
      .expect(201);

    const batch = await prisma.testBatch.findUnique({
      where: { id: response.body.id },
    });
    expect(batch?.name).toBeNull();
  });

  it('lists batches for a device with their session counts, newest first (GET /batches)', async () => {
    const firstBatch = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId, name: 'First batch' })
      .expect(201);
    const secondBatch = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId, name: 'Second batch' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/sessions')
      .send(sessionPayload(secondBatch.body.id))
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/batches')
      .query({ deviceId })
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

  it('returns an empty list for a device with no batches', async () => {
    const response = await request(app.getHttpServer())
      .get('/batches')
      .query({ deviceId })
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('rejects a session submission whose batchId does not exist (400)', async () => {
    await request(app.getHttpServer())
      .post('/sessions')
      .send(sessionPayload('does-not-exist'))
      .expect(400);
  });

  it('computes a pending result on demand instead of only relying on the background sweep (GET /batches/:id)', async () => {
    const batch = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId, name: 'Morning check-in' })
      .expect(201);

    const session = await request(app.getHttpServer())
      .post('/sessions')
      .send(sessionPayload(batch.body.id))
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/batches/${batch.body.id}`)
      .query({ deviceId })
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
      .send({ deviceId })
      .expect(201);

    const session = await request(app.getHttpServer())
      .post('/sessions')
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
      .query({ deviceId })
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
      .query({ deviceId })
      .expect(404);
  });

  it('returns 404 for a batch belonging to a different device (GET /batches/:id)', async () => {
    const batch = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/batches/${batch.body.id}`)
      .query({ deviceId: '33333333-3333-4333-8333-333333333333' })
      .expect(404);
  });
});

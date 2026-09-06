import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const deviceId = '44444444-4444-4444-8444-444444444444';

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

describe('Baseline (e2e)', () => {
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
    await prisma.baselineResult.deleteMany();
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

  async function createSessionWithMlResult(metrics: Record<string, number>) {
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
        metrics,
      },
    });
    return { batchId: batch.body.id, sessionId: session.body.id };
  }

  it('flags a metric that deviates from the user\'s own history (GET /batches/:id)', async () => {
    await createSessionWithMlResult({ tapRateHz: 5.0 });
    await createSessionWithMlResult({ tapRateHz: 6.0 });
    await createSessionWithMlResult({ tapRateHz: 7.0 });
    const current = await createSessionWithMlResult({ tapRateHz: 9.0 });

    const response = await request(app.getHttpServer())
      .get(`/batches/${current.batchId}`)
      .query({ deviceId })
      .expect(200);

    const [session] = response.body.sessions;
    expect(session.baseline).toMatchObject({
      sampleSize: 3,
      metrics: {
        tapRateHz: {
          value: 9.0,
          baselineMean: 6.0,
          isAnomalous: true,
        },
      },
    });
    expect(session.baseline.metrics.tapRateHz.zScore).toBeCloseTo(3.0, 5);

    const mlResult = await prisma.mLResult.findFirstOrThrow({
      where: { sessionId: current.sessionId },
    });
    const stored = await prisma.baselineResult.findFirst({
      where: { mlResultId: mlResult.id },
    });
    expect(stored).toMatchObject({ modelId: 'personal-baseline-zscore', baselineSampleSize: 3 });
  });

  it('returns an empty (not erroring) baseline when history is too small (GET /batches/:id)', async () => {
    const only = await createSessionWithMlResult({ tapRateHz: 9.0 });

    const response = await request(app.getHttpServer())
      .get(`/batches/${only.batchId}`)
      .query({ deviceId })
      .expect(200);

    const [session] = response.body.sessions;
    expect(session.baseline).toEqual({ sampleSize: 0, metrics: {} });
  });
});

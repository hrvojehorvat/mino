import http from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const deviceId = '44444444-4444-4444-8444-444444444444';

// services/llm-explain needs a GPU/Modal deployment to run for real, so
// these tests stand up a stub HTTP server on the same port LlmClientService
// defaults to (see llm-client.service.ts) rather than requiring one.
let explainRequestCount = 0;
let nextExplainResponse:
  | { ok: true; explanationText: string }
  | { ok: false; reason: string };

const stubLlmServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/explain') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      explainRequestCount += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(nextExplainResponse));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    stubLlmServer.listen(
      Number(new URL(process.env.LLM_SERVICE_URL ?? 'http://localhost:5002').port),
      resolve,
    );
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => stubLlmServer.close(() => resolve()));
});

describe('BatchesController — explain (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    explainRequestCount = 0;
    nextExplainResponse = { ok: true, explanationText: 'Your results look steady overall.' };

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
    await prisma.lLMExplanation.deleteMany();
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

  const createComputedBatch = async () => {
    const batch = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId, name: 'Morning check-in' })
      .expect(201);

    const session = await request(app.getHttpServer())
      .post('/sessions')
      .send({
        deviceId,
        batchId: batch.body.id,
        testType: 'fingerTapping',
        startedAt: '2026-09-05T22:00:00.000Z',
        endedAt: '2026-09-05T22:00:10.000Z',
        clientAppVersion: '0.1.0',
        deviceMetadata: { os: 'iOS', osVersion: '17.5', model: 'iPhone15,2' },
        events: [
          { seq: 0, eventType: 'touchDown', tMs: 100, x: 10, y: 20, pointerId: 0 },
          { seq: 1, eventType: 'touchUp', tMs: 180, x: 10, y: 20, pointerId: 0 },
        ],
      })
      .expect(201);

    await prisma.mLResult.create({
      data: {
        sessionId: session.body.id,
        modelId: 'signal-features',
        modelVersion: '2',
        metrics: { meanIntervalMs: 133.4 },
      },
    });

    return batch.body.id as string;
  };

  it('generates and persists an explanation (POST /batches/:id/explain)', async () => {
    const batchId = await createComputedBatch();

    const response = await request(app.getHttpServer())
      .post(`/batches/${batchId}/explain`)
      .send({ deviceId })
      .expect(201);

    expect(response.body).toMatchObject({
      text: 'Your results look steady overall.',
    });
    expect(explainRequestCount).toBe(1);

    const detail = await request(app.getHttpServer())
      .get(`/batches/${batchId}`)
      .query({ deviceId })
      .expect(200);
    expect(detail.body.llmExplanation).toMatchObject({
      text: 'Your results look steady overall.',
    });
  });

  it('does not persist anything when the guardrail rejects the generation', async () => {
    nextExplainResponse = { ok: false, reason: 'guardrail_violation' };
    const batchId = await createComputedBatch();

    await request(app.getHttpServer())
      .post(`/batches/${batchId}/explain`)
      .send({ deviceId })
      .expect(422);

    const detail = await request(app.getHttpServer())
      .get(`/batches/${batchId}`)
      .query({ deviceId })
      .expect(200);
    expect(detail.body.llmExplanation).toBeNull();
  });

  it('rejects a batch that still has sessions with no ML result', async () => {
    const batch = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/sessions')
      .send({
        deviceId,
        batchId: batch.body.id,
        testType: 'fingerTapping',
        startedAt: '2026-09-05T22:00:00.000Z',
        endedAt: '2026-09-05T22:00:10.000Z',
        clientAppVersion: '0.1.0',
        deviceMetadata: { os: 'iOS', osVersion: '17.5', model: 'iPhone15,2' },
        events: [
          { seq: 0, eventType: 'touchDown', tMs: 100, x: 10, y: 20, pointerId: 0 },
          { seq: 1, eventType: 'touchUp', tMs: 180, x: 10, y: 20, pointerId: 0 },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/batches/${batch.body.id}/explain`)
      .send({ deviceId })
      .expect(422);

    expect(explainRequestCount).toBe(0);
  });

  it('returns the cached explanation on a second call instead of generating again', async () => {
    const batchId = await createComputedBatch();

    await request(app.getHttpServer())
      .post(`/batches/${batchId}/explain`)
      .send({ deviceId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/batches/${batchId}/explain`)
      .send({ deviceId })
      .expect(201);

    expect(explainRequestCount).toBe(1);
  });

  it('returns 404 for a batch belonging to a different device', async () => {
    const batchId = await createComputedBatch();

    await request(app.getHttpServer())
      .post(`/batches/${batchId}/explain`)
      .send({ deviceId: '55555555-5555-4555-8555-555555555555' })
      .expect(404);
  });
});

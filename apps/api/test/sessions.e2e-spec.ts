import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const basePayload: Record<string, unknown> = {
  deviceId: '11111111-1111-4111-8111-111111111111',
  batchId: '',
  testType: 'fingerTapping',
  startedAt: '2026-09-02T22:00:00.000Z',
  endedAt: '2026-09-02T22:00:10.000Z',
  clientAppVersion: '0.1.0',
  deviceMetadata: { os: 'iOS', osVersion: '17.5', model: 'iPhone15,2' },
};

describe('SessionsController (e2e)', () => {
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
    await prisma.rawEvent.deleteMany();
    await prisma.sensorSession.deleteMany();
    await prisma.testSession.deleteMany();
    await prisma.testBatch.deleteMany();
    await prisma.user.deleteMany();

    const batchResponse = await request(app.getHttpServer())
      .post('/batches')
      .send({ deviceId: basePayload.deviceId });
    basePayload.batchId = batchResponse.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('persists a TestSession and its RawEvents in order (POST /sessions)', async () => {
    const payload = {
      ...basePayload,
      events: [
        { seq: 0, eventType: 'touchDown', tMs: 100, x: 10, y: 20, pointerId: 0 },
        { seq: 1, eventType: 'touchUp', tMs: 180, x: 10, y: 20, pointerId: 0 },
        { seq: 2, eventType: 'touchDown', tMs: 900, x: 12, y: 22, pointerId: 0 },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/sessions')
      .send(payload)
      .expect(201);

    expect(response.body.id).toEqual(expect.any(String));

    const sessions = await prisma.testSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: response.body.id,
      testType: 'FingerTapping',
      status: 'Completed',
    });

    const events = await prisma.rawEvent.findMany({
      where: { sessionId: response.body.id },
      orderBy: { seq: 'asc' },
    });
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.eventType)).toEqual([
      'TouchDown',
      'TouchUp',
      'TouchDown',
    ]);
  });

  it('persists a Reaction Time session with a stimulusShown + touchDown pair', async () => {
    const payload = {
      ...basePayload,
      testType: 'reactionTime',
      events: [
        { seq: 0, eventType: 'stimulusShown', tMs: 2000 },
        { seq: 1, eventType: 'touchDown', tMs: 2350 },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/sessions')
      .send(payload)
      .expect(201);

    const sessions = await prisma.testSession.findMany();
    expect(sessions[0]).toMatchObject({
      id: response.body.id,
      testType: 'ReactionTime',
      status: 'Completed',
    });

    const events = await prisma.rawEvent.findMany({
      where: { sessionId: response.body.id },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual([
      'StimulusShown',
      'TouchDown',
    ]);
    expect(events[0].x).toBeNull();
    expect(events[0].y).toBeNull();
    expect(events[0].pointerId).toBeNull();
  });

  it('persists a Target Tapping session with targetShown + touchDown/touchUp events', async () => {
    const payload = {
      ...basePayload,
      testType: 'targetTapping',
      events: [
        { seq: 0, eventType: 'targetShown', tMs: 0, x: 120, y: 340 },
        { seq: 1, eventType: 'touchDown', tMs: 420, x: 118, y: 338, pointerId: 0 },
        { seq: 2, eventType: 'touchUp', tMs: 480, x: 118, y: 338, pointerId: 0 },
        { seq: 3, eventType: 'targetShown', tMs: 490, x: 60, y: 200 },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/sessions')
      .send(payload)
      .expect(201);

    const sessions = await prisma.testSession.findMany();
    expect(sessions[0]).toMatchObject({
      id: response.body.id,
      testType: 'TargetTapping',
      status: 'Completed',
    });

    const events = await prisma.rawEvent.findMany({
      where: { sessionId: response.body.id },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual([
      'TargetShown',
      'TouchDown',
      'TouchUp',
      'TargetShown',
    ]);
    expect(events[0]).toMatchObject({ x: 120, y: 340, pointerId: null });
    expect(events[1]).toMatchObject({ x: 118, y: 338, pointerId: 0 });
  });

  it('persists a Finger Tracing session with testParams and touchMove events', async () => {
    const payload = {
      ...basePayload,
      testType: 'fingerTracing',
      testParams: {
        referencePath: [
          { x: 40, y: 100 },
          { x: 200, y: 250 },
          { x: 360, y: 100 },
        ],
      },
      events: [
        { seq: 0, eventType: 'touchDown', tMs: 0, x: 40, y: 100, pointerId: 0 },
        { seq: 1, eventType: 'touchMove', tMs: 40, x: 90, y: 150, pointerId: 0 },
        { seq: 2, eventType: 'touchMove', tMs: 80, x: 150, y: 210, pointerId: 0 },
        { seq: 3, eventType: 'touchUp', tMs: 400, x: 360, y: 100, pointerId: 0 },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/sessions')
      .send(payload)
      .expect(201);

    const sessions = await prisma.testSession.findMany();
    expect(sessions[0]).toMatchObject({
      id: response.body.id,
      testType: 'FingerTracing',
      status: 'Completed',
      testParams: payload.testParams,
    });

    const events = await prisma.rawEvent.findMany({
      where: { sessionId: response.body.id },
      orderBy: { seq: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual([
      'TouchDown',
      'TouchMove',
      'TouchMove',
      'TouchUp',
    ]);
  });

  it('persists a Phone Stability session as a SensorSession (no events)', async () => {
    const payload = {
      ...basePayload,
      testType: 'phoneStability',
      events: [],
      sensorSamples: [
        { tMs: 0, ax: 0.01, ay: 0.02, az: 9.8, gx: 0.001, gy: 0.002, gz: 0.0 },
        { tMs: 20, ax: 0.01, ay: 0.02, az: 9.79, gx: 0.001, gy: 0.001, gz: 0.0 },
        { tMs: 40, ax: 0.02, ay: 0.02, az: 9.81, gx: 0.002, gy: 0.001, gz: 0.0 },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/sessions')
      .send(payload)
      .expect(201);

    const sessions = await prisma.testSession.findMany();
    expect(sessions[0]).toMatchObject({
      id: response.body.id,
      testType: 'PhoneStability',
      status: 'Completed',
    });

    const events = await prisma.rawEvent.findMany({
      where: { sessionId: response.body.id },
    });
    expect(events).toHaveLength(0);

    const sensorSession = await prisma.sensorSession.findFirst({
      where: { sessionId: response.body.id },
    });
    expect(sensorSession).not.toBeNull();
    expect(sensorSession?.samples).toEqual(payload.sensorSamples);
  });

  it('persists a Guided Movement session as a SensorSession (no events)', async () => {
    const payload = {
      ...basePayload,
      testType: 'guidedMovement',
      events: [],
      sensorSamples: [
        { tMs: 0, ax: 0.01, ay: 0.02, az: 9.8, gx: 0.001, gy: 0.002, gz: 0.0 },
        { tMs: 20, ax: 0.3, ay: 0.05, az: 9.7, gx: 0.02, gy: 0.01, gz: 0.0 },
        { tMs: 40, ax: 0.6, ay: 0.08, az: 9.6, gx: 0.04, gy: 0.02, gz: 0.0 },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/sessions')
      .send(payload)
      .expect(201);

    const sessions = await prisma.testSession.findMany();
    expect(sessions[0]).toMatchObject({
      id: response.body.id,
      testType: 'GuidedMovement',
      status: 'Completed',
    });

    const events = await prisma.rawEvent.findMany({
      where: { sessionId: response.body.id },
    });
    expect(events).toHaveLength(0);

    const sensorSession = await prisma.sensorSession.findFirst({
      where: { sessionId: response.body.id },
    });
    expect(sensorSession).not.toBeNull();
    expect(sensorSession?.samples).toEqual(payload.sensorSamples);
  });

  it('rejects a submission missing deviceId (400)', async () => {
    const { deviceId: _deviceId, ...payloadWithoutDeviceId } = basePayload;
    await request(app.getHttpServer())
      .post('/sessions')
      .send({
        ...payloadWithoutDeviceId,
        events: [
          { seq: 0, eventType: 'touchDown', tMs: 100, x: 1, y: 1, pointerId: 0 },
        ],
      })
      .expect(400);
  });

  it('rejects a submission with an empty events array (400)', async () => {
    await request(app.getHttpServer())
      .post('/sessions')
      .send({ ...basePayload, events: [] })
      .expect(400);
  });

  it('rejects a submission whose event count is physically implausible (400)', async () => {
    const events = Array.from({ length: 300 }, (_, i) => ({
      seq: i,
      eventType: i % 2 === 0 ? 'touchDown' : 'touchUp',
      tMs: i,
      x: 1,
      y: 1,
      pointerId: 0,
    }));

    await request(app.getHttpServer())
      .post('/sessions')
      .send({ ...basePayload, events })
      .expect(400);
  });
});

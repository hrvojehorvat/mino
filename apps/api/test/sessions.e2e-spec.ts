import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const basePayload = {
  deviceId: '11111111-1111-4111-8111-111111111111',
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
    await prisma.testSession.deleteMany();
    await prisma.user.deleteMany();
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

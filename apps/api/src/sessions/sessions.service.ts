import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SessionStatus, TestType, TouchEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTestSessionDto } from './dto/create-test-session.dto.js';
import { SensorSessionsService } from './sensor-sessions.service.js';

const MAX_TAPS_PER_SECOND = 20;
const MAX_SENSOR_SAMPLES_PER_SECOND = 120;
const T_MS_GRACE_MS = 500;

const testTypeMap: Record<string, TestType> = {
  fingerTapping: TestType.FingerTapping,
  reactionTime: TestType.ReactionTime,
  targetTapping: TestType.TargetTapping,
  fingerTracing: TestType.FingerTracing,
  phoneStability: TestType.PhoneStability,
  guidedMovement: TestType.GuidedMovement,
};

const eventTypeMap: Record<string, TouchEventType> = {
  touchDown: TouchEventType.TouchDown,
  touchUp: TouchEventType.TouchUp,
  stimulusShown: TouchEventType.StimulusShown,
  targetShown: TouchEventType.TargetShown,
  touchMove: TouchEventType.TouchMove,
};

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensorSessions: SensorSessionsService,
  ) {}

  async create(dto: CreateTestSessionDto): Promise<{ id: string }> {
    const events = dto.events ?? [];
    const sensorSamples = dto.sensorSamples ?? [];

    if (events.length === 0 && sensorSamples.length === 0) {
      throw new BadRequestException(
        'submission must include events or sensorSamples',
      );
    }

    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);

    if (endedAt.getTime() <= startedAt.getTime()) {
      throw new BadRequestException('endedAt must be after startedAt');
    }

    const durationMs = endedAt.getTime() - startedAt.getTime();
    const maxPlausibleEvents = (durationMs / 1000) * MAX_TAPS_PER_SECOND;

    if (events.length > maxPlausibleEvents) {
      throw new BadRequestException(
        'event count exceeds what is physically possible for the session duration',
      );
    }

    for (const event of events) {
      if (event.tMs > durationMs + T_MS_GRACE_MS) {
        throw new BadRequestException(
          'event tMs exceeds the session duration',
        );
      }
    }

    const maxPlausibleSamples =
      (durationMs / 1000) * MAX_SENSOR_SAMPLES_PER_SECOND;

    if (sensorSamples.length > maxPlausibleSamples) {
      throw new BadRequestException(
        'sensor sample count exceeds what is physically possible for the session duration',
      );
    }

    const user = await this.prisma.user.upsert({
      where: { deviceId: dto.deviceId },
      create: { deviceId: dto.deviceId },
      update: {},
    });

    const batch = await this.prisma.testBatch.findUnique({
      where: { id: dto.batchId },
    });

    if (!batch || batch.userId !== user.id) {
      throw new BadRequestException('batchId does not exist for this device');
    }

    const session = await this.prisma.testSession.create({
      data: {
        userId: user.id,
        batchId: dto.batchId,
        testType: testTypeMap[dto.testType],
        startedAt,
        endedAt,
        clientAppVersion: dto.clientAppVersion,
        deviceMetadata: { ...dto.deviceMetadata },
        status: SessionStatus.Completed,
        ...(dto.testParams
          ? {
              testParams: {
                ...dto.testParams,
              } as unknown as Prisma.InputJsonValue,
            }
          : {}),
        events: {
          createMany: {
            data: events.map((e) => ({
              seq: e.seq,
              eventType: eventTypeMap[e.eventType],
              tMs: e.tMs,
              x: e.x,
              y: e.y,
              pointerId: e.pointerId,
            })),
          },
        },
      },
    });

    if (sensorSamples.length > 0) {
      await this.sensorSessions.storeSamples(session.id, sensorSamples);
    }

    return { id: session.id };
  }
}

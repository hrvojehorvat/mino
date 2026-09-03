import { BadRequestException, Injectable } from '@nestjs/common';
import { SessionStatus, TestType, TouchEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTestSessionDto } from './dto/create-test-session.dto.js';

const MAX_TAPS_PER_SECOND = 20;
const T_MS_GRACE_MS = 500;

const testTypeMap: Record<string, TestType> = {
  fingerTapping: TestType.FingerTapping,
  reactionTime: TestType.ReactionTime,
};

const eventTypeMap: Record<string, TouchEventType> = {
  touchDown: TouchEventType.TouchDown,
  touchUp: TouchEventType.TouchUp,
  stimulusShown: TouchEventType.StimulusShown,
};

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTestSessionDto): Promise<{ id: string }> {
    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);

    if (endedAt.getTime() <= startedAt.getTime()) {
      throw new BadRequestException('endedAt must be after startedAt');
    }

    const durationMs = endedAt.getTime() - startedAt.getTime();
    const maxPlausibleEvents = (durationMs / 1000) * MAX_TAPS_PER_SECOND;

    if (dto.events.length > maxPlausibleEvents) {
      throw new BadRequestException(
        'event count exceeds what is physically possible for the session duration',
      );
    }

    for (const event of dto.events) {
      if (event.tMs > durationMs + T_MS_GRACE_MS) {
        throw new BadRequestException(
          'event tMs exceeds the session duration',
        );
      }
    }

    const user = await this.prisma.user.upsert({
      where: { deviceId: dto.deviceId },
      create: { deviceId: dto.deviceId },
      update: {},
    });

    const session = await this.prisma.testSession.create({
      data: {
        userId: user.id,
        testType: testTypeMap[dto.testType],
        startedAt,
        endedAt,
        clientAppVersion: dto.clientAppVersion,
        deviceMetadata: { ...dto.deviceMetadata },
        status: SessionStatus.Completed,
        events: {
          createMany: {
            data: dto.events.map((e) => ({
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

    return { id: session.id };
  }
}

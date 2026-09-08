import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateTestSessionDto } from './dto/create-test-session.dto.js';
import { SessionsService } from './sessions.service.js';

@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(
    @Body() dto: CreateTestSessionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.sessionsService.create(dto, user.id);
  }
}

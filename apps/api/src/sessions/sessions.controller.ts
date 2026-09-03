import { Body, Controller, Post } from '@nestjs/common';
import { CreateTestSessionDto } from './dto/create-test-session.dto.js';
import { SessionsService } from './sessions.service.js';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(@Body() dto: CreateTestSessionDto) {
    return this.sessionsService.create(dto);
  }
}

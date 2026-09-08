import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BatchesService } from './batches.service.js';
import { CreateTestBatchDto } from './dto/create-test-batch.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  create(@Body() dto: CreateTestBatchDto, @CurrentUser() user: { id: string }) {
    return this.batchesService.create(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.batchesService.findAllForUser(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.batchesService.findOneForUser(id, user.id);
  }

  @Post(':id/explain')
  explain(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.batchesService.explainForUser(id, user.id);
  }
}

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BatchesService } from './batches.service.js';
import { CreateTestBatchDto } from './dto/create-test-batch.dto.js';
import { ListTestBatchesDto } from './dto/list-test-batches.dto.js';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  create(@Body() dto: CreateTestBatchDto) {
    return this.batchesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListTestBatchesDto) {
    return this.batchesService.findAllForDevice(query.deviceId);
  }
}

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaStore } from '../../infrastructure/database/store';
import { Public } from '../security';
@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaStore) {}
  @Get() async health() {
    if (!(await this.db.healthy())) throw new ServiceUnavailableException();
    return { status: 'ok' };
  }
}

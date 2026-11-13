import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HousekeepingService } from '../application/common/housekeeping.service';
@Injectable()
export class ScheduledJobs {
  private readonly logger = new Logger(ScheduledJobs.name);
  constructor(private readonly housekeeping: HousekeepingService) {}
  @Cron('0 0 9 * * *', { timeZone: 'Africa/Cairo', waitForCompletion: true })
  async daily() {
    try {
      await this.housekeeping.run();
    } catch {
      this.logger.error({ code: 'HOUSEKEEPING_FAILED' });
    }
  }
}

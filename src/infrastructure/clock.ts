import { DateTime } from 'luxon';
import { Clock } from '../application/common/ports';
export class CairoClock implements Clock {
  constructor(private readonly zone = 'Africa/Cairo') {}
  now() {
    return new Date();
  }
  endOfDay(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = DateTime.fromISO(date, { zone: this.zone });
    return parsed.isValid && parsed.toISODate() === date
      ? parsed.endOf('day').toUTC().toJSDate()
      : null;
  }
  localDate(moment: Date) {
    return DateTime.fromJSDate(moment, { zone: this.zone }).toISODate()!;
  }
  addDays(date: string, days: number) {
    return DateTime.fromISO(date, { zone: this.zone })
      .plus({ days })
      .toISODate()!;
  }
}

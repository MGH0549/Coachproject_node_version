import {
  effectiveStatus,
  photoRetentionEnded,
  requireActive,
  selectionAllowed,
  validateEnd,
} from '../src/domain/rules/access';
import { CairoClock } from '../src/infrastructure/clock';
import { withTotals } from '../src/application/diet/diet.service';
import { Diet } from '../src/domain/models';
const now = new Date('2026-11-13T12:00:00Z');
describe('account business rules', () => {
  const active = {
    status: 'Active' as const,
    accessEndAt: new Date('2026-11-14T00:00:00Z'),
    deactivatedAt: null,
  };
  it('expires at the exact deadline without a job', () => {
    expect(effectiveStatus(active, now)).toBe('Active');
    expect(effectiveStatus(active, active.accessEndAt)).toBe('Expired');
    expect(requireActive({ ...active, status: 'Pending' }, now).ok).toBe(false);
    expect(requireActive({ ...active, status: 'Deactivated' }, now).ok).toBe(
      false,
    );
    expect(requireActive({ ...active, accessEndAt: null }, now).ok).toBe(false);
  });
  it('rejects past activation and non-increasing extensions', () => {
    expect(validateEnd(now, now).ok).toBe(false);
    expect(validateEnd(active.accessEndAt, now, active.accessEndAt).ok).toBe(
      false,
    );
    expect(validateEnd(active.accessEndAt, now).ok).toBe(true);
  });
  it('allows only coach changes while choices are locked', () => {
    expect(selectionAllowed(true, false).ok).toBe(false);
    expect(selectionAllowed(true, true).ok).toBe(true);
    expect(selectionAllowed(false, false).ok).toBe(true);
  });
  it('retains numbers and delays photo deletion seven days, respecting reactivation', () => {
    const end = new Date(now.getTime() - 7 * 86400000);
    expect(photoRetentionEnded({ ...active, accessEndAt: end }, now)).toBe(
      true,
    );
    expect(
      photoRetentionEnded(
        { ...active, accessEndAt: new Date(end.getTime() + 1) },
        now,
      ),
    ).toBe(false);
    expect(photoRetentionEnded(active, now)).toBe(false);
    expect(
      photoRetentionEnded(
        { ...active, status: 'Deactivated', deactivatedAt: end },
        now,
      ),
    ).toBe(true);
  });
});
describe('Cairo dates, midnight and DST', () => {
  const clock = new CairoClock();
  it('uses winter and summer offsets at the selected calendar day end', () => {
    expect(clock.endOfDay('2026-01-31')?.toISOString()).toBe(
      '2026-01-31T21:59:59.999Z',
    );
    expect(clock.endOfDay('2026-07-31')?.toISOString()).toBe(
      '2026-07-31T20:59:59.999Z',
    );
  });
  it('groups late workouts by Cairo date', () => {
    expect(clock.localDate(new Date('2026-07-31T21:30:00Z'))).toBe(
      '2026-08-01',
    );
    expect(clock.localDate(new Date('2026-01-31T21:30:00Z'))).toBe(
      '2026-01-31',
    );
  });
  it('handles the spring gap and autumn overlap as calendar days', () => {
    expect(clock.endOfDay('2026-04-24')?.toISOString()).toBe(
      '2026-04-24T20:59:59.999Z',
    );
    expect(clock.endOfDay('2026-10-30')?.toISOString()).toBe(
      '2026-10-30T21:59:59.999Z',
    );
    expect(clock.addDays('2026-04-23', 3)).toBe('2026-04-26');
  });
  it.each(['2026-02-30', 'garbage', '2026-1-1', '2026-01-01T00:00:00Z'])(
    'rejects invalid calendar date %s',
    (date) => expect(clock.endOfDay(date)).toBeNull(),
  );
});
it('calculates totals from selected meal options only', () => {
  const option = {
    id: 'a',
    name: 'وجبة',
    calories: 500,
    protein: 30,
    carbs: 50,
    fat: 20,
    items: [],
  };
  const plan: Diet = {
    id: 'p',
    clientId: 'c',
    name: 'خطة',
    isTemplate: false,
    choicesLocked: false,
    version: 1,
    calories: 2000,
    protein: 120,
    carbs: 200,
    fat: 80,
    meals: [
      {
        id: 'm',
        name: 'فطور',
        time: null,
        order: 0,
        options: [option, { ...option, id: 'b', calories: 600 }],
        selection: { optionId: 'b', locked: false },
      },
    ],
  };
  expect(withTotals(plan).selectedTotals).toEqual({
    calories: 600,
    protein: 30,
    carbs: 50,
    fat: 20,
  });
});

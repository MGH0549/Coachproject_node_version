import {
  estimatedOneRepMax,
  strengthMetrics,
  strengthOverview,
  validateStrengthSets,
} from '../src/domain/rules/strength';
import { StrengthSession } from '../src/domain/models';

describe('strength set limits', () => {
  const set = { setNumber: 1, weightKg: 100.25, repetitions: 8 };
  it.each([0, 0.25, 499.75, 500])('accepts weight %s kg', (weightKg) => {
    expect(validateStrengthSets([{ ...set, weightKg }]).ok).toBe(true);
  });
  it.each([-0.25, 500.25, 10.1, NaN, Infinity])(
    'rejects weight %s kg',
    (weightKg) => {
      expect(validateStrengthSets([{ ...set, weightKg }]).ok).toBe(false);
    },
  );
  it.each([0, 101, 1.5, NaN, Infinity])(
    'rejects repetitions %s',
    (repetitions) => {
      expect(validateStrengthSets([{ ...set, repetitions }]).ok).toBe(false);
    },
  );
  it.each([1, 100])('accepts repetitions %s', (repetitions) => {
    expect(validateStrengthSets([{ ...set, repetitions }]).ok).toBe(true);
  });
  it('requires one to ten uniquely numbered sets', () => {
    expect(validateStrengthSets([]).ok).toBe(false);
    expect(validateStrengthSets([set, set]).ok).toBe(false);
    expect(validateStrengthSets([{ ...set, setNumber: 0 }]).ok).toBe(false);
    expect(validateStrengthSets([{ ...set, setNumber: 1.5 }]).ok).toBe(false);
    expect(
      validateStrengthSets(
        Array.from({ length: 10 }, (_, i) => ({ ...set, setNumber: i + 1 })),
      ).ok,
    ).toBe(true);
    expect(
      validateStrengthSets(
        Array.from({ length: 11 }, (_, i) => ({ ...set, setNumber: i + 1 })),
      ).ok,
    ).toBe(false);
  });
});

describe('strength calculations', () => {
  const heavy = { setNumber: 1, weightKg: 100, repetitions: 1 };
  const best = { setNumber: 2, weightKg: 90, repetitions: 10 };
  it('uses Epley, preserves the single-rep weight and distinguishes best set from heaviest weight', () => {
    expect(estimatedOneRepMax(heavy)).toBe(100);
    expect(strengthMetrics([heavy, best])).toEqual({
      bestSet: best,
      heaviestWeightKg: 100,
      estimatedOneRepMaxKg: 120,
    });
    expect(
      strengthMetrics([{ ...heavy, weightKg: 0 }]).estimatedOneRepMaxKg,
    ).toBe(0);
    expect(
      strengthMetrics([{ ...heavy, weightKg: 80.25, repetitions: 7 }])
        .estimatedOneRepMaxKg,
    ).toBe(98.98);
  });
  const session = (
    id: string,
    date: string,
    weightKg: number,
  ): StrengthSession => ({
    id,
    clientId: 'client',
    planExerciseId: 'placement',
    exerciseId: 'exercise',
    exerciseName: 'Squat',
    alternativeId: null,
    recordedAt: new Date(date),
    localDate: '2026-11-20',
    note: null,
    sets: [{ ...heavy, weightKg }],
  });
  it('compares the newest two sessions and includes exercises with no entries', () => {
    const result = strengthOverview(
      [
        session('a', '2026-11-18T12:00:00Z', 200),
        session('b', '2026-11-20T12:00:00Z', 100),
        session('c', '2026-11-19T12:00:00Z', 110),
      ],
      [
        { id: 'exercise', name: 'Squat' },
        { id: 'empty', name: 'Unlogged' },
      ],
    );
    expect(result[0]).toMatchObject({
      latestWeightKg: 100,
      bestWeightKg: 200,
      estimatedOneRepMaxKg: 200,
      trendKg: -10,
    });
    expect(result[1]).toMatchObject({
      latestWeightKg: null,
      bestWeightKg: null,
      bestSet: null,
      estimatedOneRepMaxKg: null,
      trendKg: null,
    });
    expect(
      strengthOverview([session('a', '2026-11-20T12:00:00Z', 100)], [])[0]
        .trendKg,
    ).toBeNull();
  });
});

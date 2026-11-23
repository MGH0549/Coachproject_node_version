import { StrengthSet, StrengthSession } from '../models';
import { fail, ok } from '../result';

export function validateStrengthSets(sets: StrengthSet[]) {
  if (
    !Array.isArray(sets) ||
    sets.length < 1 ||
    sets.length > 10 ||
    sets.some(
      (s) =>
        !s ||
        !Number.isInteger(s.setNumber) ||
        s.setNumber < 1 ||
        s.setNumber > 10 ||
        !Number.isFinite(s.weightKg) ||
        s.weightKg < 0 ||
        s.weightKg > 500 ||
        !Number.isInteger(s.weightKg * 4) ||
        !Number.isInteger(s.repetitions) ||
        s.repetitions < 1 ||
        s.repetitions > 100,
    ) ||
    new Set(sets.map((s) => s.setNumber)).size !== sets.length
  )
    return fail('INVALID_STRENGTH_SETS', 'مجموعات التمرين غير صالحة');
  return ok(true);
}

const round = (value: number) => Math.round(value * 100) / 100;
export function estimatedOneRepMax(set: StrengthSet) {
  return set.weightKg * (set.repetitions === 1 ? 1 : 1 + set.repetitions / 30);
}
export function strengthMetrics(sets: StrengthSet[]) {
  let bestSet: StrengthSet | null = null;
  let heaviestWeightKg: number | null = null;
  for (const set of sets) {
    heaviestWeightKg = Math.max(heaviestWeightKg ?? 0, set.weightKg);
    if (
      !bestSet ||
      (estimatedOneRepMax(set) - estimatedOneRepMax(bestSet) ||
        set.weightKg - bestSet.weightKg ||
        set.repetitions - bestSet.repetitions ||
        bestSet.setNumber - set.setNumber) > 0
    )
      bestSet = set;
  }
  return {
    bestSet,
    heaviestWeightKg,
    estimatedOneRepMaxKg: bestSet ? round(estimatedOneRepMax(bestSet)) : null,
  };
}
export function strengthOverview(
  sessions: StrengthSession[],
  exercises: { id: string; name: string }[],
) {
  const groups = new Map(
    exercises.map((e) => [
      e.id,
      {
        exerciseId: e.id,
        exerciseName: e.name,
        sessions: [] as StrengthSession[],
      },
    ]),
  );
  for (const session of sessions) {
    if (!groups.has(session.exerciseId))
      groups.set(session.exerciseId, {
        exerciseId: session.exerciseId,
        exerciseName: session.exerciseName,
        sessions: [],
      });
    groups.get(session.exerciseId)!.sessions.push(session);
  }
  return [...groups.values()]
    .map((group) => {
      const ordered = group.sessions.sort(
        (a, b) =>
          b.recordedAt.getTime() - a.recordedAt.getTime() ||
          b.id.localeCompare(a.id),
      );
      const latest = ordered[0];
      const previous = ordered[1];
      const metrics = strengthMetrics(ordered.flatMap((s) => s.sets));
      return {
        exerciseId: group.exerciseId,
        exerciseName: group.exerciseName,
        latestWeightKg: latest
          ? strengthMetrics(latest.sets).heaviestWeightKg
          : null,
        bestWeightKg: metrics.heaviestWeightKg,
        bestSet: metrics.bestSet,
        estimatedOneRepMaxKg: metrics.estimatedOneRepMaxKg,
        trendKg:
          latest && previous
            ? round(
                strengthMetrics(latest.sets).estimatedOneRepMaxKg! -
                  strengthMetrics(previous.sets).estimatedOneRepMaxKg!,
              )
            : null,
        latestRecordedAt: latest?.recordedAt ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.exerciseName.localeCompare(b.exerciseName) ||
        a.exerciseId.localeCompare(b.exerciseId),
    );
}

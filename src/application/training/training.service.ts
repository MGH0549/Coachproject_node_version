import { Actor, TrainingInput } from '../../domain/models';
import { conflict, fail, missing, ok } from '../../domain/result';
import { Store } from '../common/ports';
export class TrainingService {
  constructor(private readonly db: Store) {}
  async remove(
    actor: Actor,
    clientId: string,
    planId: string,
    version: number,
  ) {
    if (actor.role !== 'Coach')
      return fail('FORBIDDEN', 'ليس لديك صلاحية لهذا الإجراء', 403);
    const result = await this.db.deleteClientPlan(
      actor,
      'training',
      clientId,
      planId,
      version,
    );
    return result === 'ok'
      ? ok({ message: 'تم حذف الخطة' })
      : result === 'missing'
        ? missing()
        : conflict();
  }
  async get(clientId: string, withWeights = false) {
    const plan = await this.db.training(clientId);
    if (!plan) return missing();
    if (!withWeights) return ok(plan);
    const sessions = await this.db.strengthSessions(clientId);
    const last = (exerciseId: string) => {
      const history = sessions.filter((s) => s.exerciseId === exerciseId);
      const latest = history.sort(
        (a, b) =>
          b.recordedAt.getTime() - a.recordedAt.getTime() ||
          b.id.localeCompare(a.id),
      )[0];
      return latest
        ? {
            lastSession: {
              sets: latest.sets,
              recordedAt: latest.recordedAt,
              localDate: latest.localDate,
            },
            bestWeightKg: Math.max(
              ...history.flatMap((s) => s.sets.map((set) => set.weightKg)),
            ),
          }
        : {};
    };
    return ok({
      ...plan,
      days: plan.days.map((day) => ({
        ...day,
        exercises: day.exercises.map((exercise) => ({
          ...exercise,
          ...last(exercise.exerciseId),
          alternatives: exercise.alternatives.map((alt) => ({
            ...alt,
            ...last(alt.exerciseId),
          })),
        })),
      })),
    });
  }
  async save(
    actor: Actor,
    input: TrainingInput,
    target: { clientId?: string; id?: string; version?: number },
  ) {
    if (target.clientId && !(await this.db.client(target.clientId)))
      return missing();
    if (
      new Set(input.days.map((d) => d.order)).size !== input.days.length ||
      input.days.some(
        (d) =>
          new Set(d.exercises.map((e) => e.order)).size !== d.exercises.length,
      )
    )
      return fail('DUPLICATE_ORDER', 'ترتيب الأيام أو التمارين مكرر');
    for (const item of input.days.flatMap((d) => d.exercises)) {
      const ids = [
        item.exerciseId,
        ...item.alternatives.map((a) => a.exerciseId),
      ];
      if (new Set(ids).size !== ids.length)
        return fail('DUPLICATE_EXERCISE', 'لا يمكن تكرار التمرين ضمن البدائل');
      for (const id of ids) {
        const exercise = await this.db.exercise(id);
        if (!exercise || exercise.archived)
          return fail('INVALID_EXERCISE', 'التمرين غير موجود أو مؤرشف');
      }
    }
    const plan = await this.db.saveTraining(actor, input, target);
    return plan ? ok(plan) : conflict();
  }
  async choose(
    actor: Actor,
    clientId: string,
    id: string,
    alternativeId: string | null,
    version: number,
    locked?: boolean,
  ) {
    const result = await this.db.chooseExercise(
      actor,
      clientId,
      id,
      alternativeId,
      version,
      locked,
    );
    return result === 'ok'
      ? this.get(clientId)
      : result === 'locked'
        ? fail('CHOICE_LOCKED', 'الاختيار مقفل بواسطة المدرب', 403)
        : result === 'missing'
          ? missing()
          : conflict();
  }
  async lock(actor: Actor, clientId: string, locked: boolean, version: number) {
    return (await this.db.lockPlan(
      actor,
      'training',
      clientId,
      locked,
      version,
    ))
      ? this.get(clientId)
      : conflict();
  }
}

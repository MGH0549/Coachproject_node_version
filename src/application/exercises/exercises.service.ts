import { Actor, ExerciseInput, PageQuery } from '../../domain/models';
import { conflict, fail, missing, ok } from '../../domain/result';
import { Store } from '../common/ports';
export class ExercisesService {
  private cache = new Map<
    string,
    { until: number; value: Awaited<ReturnType<Store['exercises']>> }
  >();
  constructor(private readonly db: Store) {}
  async list(query: PageQuery) {
    const key = JSON.stringify(query);
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return ok(cached.value);
    const value = await this.db.exercises(query);
    if (this.cache.size >= 100) this.cache.clear();
    this.cache.set(key, { until: Date.now() + 60000, value });
    return ok(value);
  }
  async save(
    actor: Actor,
    input: ExerciseInput,
    id?: string,
    version?: number,
  ) {
    if (id && !(await this.db.exercise(id))) return missing();
    const value = await this.db.saveExercise(actor, input, id, version);
    this.cache.clear();
    return value ? ok(value) : conflict();
  }
  async archive(actor: Actor, id: string, version: number) {
    const changed = await this.db.archiveExercise(actor, id, version);
    this.cache.clear();
    return changed ? ok({ message: 'تمت الأرشفة' }) : conflict();
  }
  async remove(actor: Actor, id: string, version: number) {
    const outcome = await this.db.deleteExercise(actor, id, version);
    this.cache.clear();
    return outcome === 'ok'
      ? ok({ message: 'تم الحذف' })
      : outcome === 'in-use'
        ? fail('EXERCISE_IN_USE', 'التمرين مستخدم في خطة. يمكنك أرشفته', 409)
        : conflict();
  }
}

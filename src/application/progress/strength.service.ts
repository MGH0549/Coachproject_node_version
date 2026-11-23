import { PageQuery, StrengthEdit, StrengthInput } from '../../domain/models';
import { fail, missing, ok } from '../../domain/result';
import {
  strengthMetrics,
  strengthOverview,
  validateStrengthSets,
} from '../../domain/rules/strength';
import { Clock, Store } from '../common/ports';

export class StrengthService {
  constructor(
    private readonly db: Store,
    private readonly clock: Clock,
  ) {}
  async save(clientId: string, input: StrengthInput) {
    const valid = validateStrengthSets(input.sets);
    if (!valid.ok) return valid;
    const now = this.clock.now();
    return this.saved(
      await this.db.saveStrength(
        clientId,
        input,
        now,
        this.clock.localDate(now),
      ),
    );
  }
  async edit(clientId: string, id: string, input: StrengthEdit) {
    const valid = validateStrengthSets(input.sets);
    if (!valid.ok) return valid;
    return this.saved(await this.db.editStrength(clientId, id, input));
  }
  private saved(result: Awaited<ReturnType<Store['saveStrength']>>) {
    if (result === 'missing') return missing();
    if (result === 'locked')
      return fail('CHOICE_LOCKED', 'اختيار التمرين مقفل', 403);
    if (result === 'limit')
      return fail(
        'STRENGTH_SET_LIMIT',
        'الحد الأقصى عشر مجموعات لكل تمرين في اليوم',
        409,
      );
    return ok({ ...result, ...strengthMetrics(result.sets) });
  }
  async remove(clientId: string, id: string) {
    return (await this.db.deleteStrength(clientId, id))
      ? ok({ message: 'تم حذف سجل القوة' })
      : missing();
  }
  async history(clientId: string, query: PageQuery, exerciseId?: string) {
    if (!(await this.db.client(clientId))) return missing();
    const page = await this.db.strengthHistory(clientId, query, exerciseId);
    return ok({
      ...page,
      items: page.items.map((s) => ({ ...s, ...strengthMetrics(s.sets) })),
    });
  }
  async overview(clientId: string) {
    const [sessions, plan] = await Promise.all([
      this.db.strengthSessions(clientId),
      this.db.training(clientId),
    ]);
    const exercises =
      plan?.days.flatMap((day) =>
        day.exercises.flatMap((e) => [
          e.exercise,
          ...e.alternatives.map((a) => a.exercise),
        ]),
      ) ?? [];
    return ok({ items: strengthOverview(sessions, exercises) });
  }
}

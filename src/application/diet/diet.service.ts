import { Actor, Diet, DietInput } from '../../domain/models';
import { conflict, fail, missing, ok } from '../../domain/result';
import { Store } from '../common/ports';
export function withTotals(plan: Diet) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const meal of plan.meals) {
    const option = meal.options.find((o) => o.id === meal.selection?.optionId);
    if (option)
      for (const key of ['calories', 'protein', 'carbs', 'fat'] as const)
        totals[key] += option[key];
  }
  return { ...plan, selectedTotals: totals };
}
export class DietService {
  constructor(private readonly db: Store) {}
  async get(clientId: string) {
    const plan = await this.db.diet(clientId);
    return plan ? ok(withTotals(plan)) : missing();
  }
  async save(
    actor: Actor,
    input: DietInput,
    target: { clientId?: string; id?: string; version?: number },
  ) {
    if (target.clientId && !(await this.db.client(target.clientId)))
      return missing();
    if (new Set(input.meals.map((m) => m.order)).size !== input.meals.length)
      return fail('DUPLICATE_ORDER', 'ترتيب الوجبات مكرر');
    if (input.meals.some((m) => m.options.length < 2))
      return fail(
        'MEAL_OPTIONS_REQUIRED',
        'يجب إضافة خيارين على الأقل لكل وجبة',
      );
    const plan = await this.db.saveDiet(actor, input, target);
    return plan ? ok(withTotals(plan)) : conflict();
  }
  async choose(
    actor: Actor,
    clientId: string,
    mealId: string,
    optionId: string,
    version: number,
    locked?: boolean,
  ) {
    const result = await this.db.chooseMeal(
      actor,
      clientId,
      mealId,
      optionId,
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
    return (await this.db.lockPlan(actor, 'diet', clientId, locked, version))
      ? this.get(clientId)
      : conflict();
  }
}

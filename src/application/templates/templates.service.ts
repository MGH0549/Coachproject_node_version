import {
  Actor,
  PageQuery,
  TrainingInput,
  DietInput,
} from '../../domain/models';
import { missing, ok } from '../../domain/result';
import { Store } from '../common/ports';
import { TrainingService } from '../training/training.service';
import { DietService } from '../diet/diet.service';
export class TemplatesService {
  constructor(
    private readonly db: Store,
    private readonly training: TrainingService,
    private readonly diet: DietService,
  ) {}
  async list(kind: 'training' | 'diet', query: PageQuery) {
    return ok(await this.db.templates(kind, query));
  }
  async get(kind: 'training' | 'diet', id: string) {
    const plan =
      kind === 'training'
        ? await this.db.trainingById(id)
        : await this.db.dietById(id);
    return plan?.isTemplate ? ok(plan) : missing();
  }
  async copy(
    actor: Actor,
    kind: 'training' | 'diet',
    templateId: string,
    clientId: string,
    version?: number,
  ) {
    if (kind === 'training') {
      const template = await this.db.trainingById(templateId);
      if (!template?.isTemplate) return missing();
      const input: TrainingInput = {
        name: template.name,
        days: template.days.map((d) => ({
          name: d.name,
          order: d.order,
          exercises: d.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sets: e.sets,
            reps: e.reps,
            restSeconds: e.restSeconds,
            tempo: e.tempo ?? undefined,
            note: e.note ?? undefined,
            order: e.order,
            alternatives: e.alternatives.map((a) => ({
              exerciseId: a.exerciseId,
              sets: a.sets ?? undefined,
              reps: a.reps ?? undefined,
              note: a.note ?? undefined,
            })),
          })),
        })),
      };
      return this.training.save(actor, input, { clientId, version });
    }
    const template = await this.db.dietById(templateId);
    if (!template?.isTemplate) return missing();
    const input: DietInput = {
      name: template.name,
      calories: template.calories,
      protein: template.protein,
      carbs: template.carbs,
      fat: template.fat,
      meals: template.meals.map((m) => ({
        name: m.name,
        time: m.time ?? undefined,
        order: m.order,
        options: m.options.map((o) => ({
          name: o.name,
          calories: o.calories,
          protein: o.protein,
          carbs: o.carbs,
          fat: o.fat,
          items: o.items.map((i) => ({
            food: i.food,
            quantity: i.quantity,
            unit: i.unit,
          })),
        })),
      })),
    };
    return this.diet.save(actor, input, { clientId, version });
  }
}

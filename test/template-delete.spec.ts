import 'reflect-metadata';
import { PrismaStore } from '../src/infrastructure/database/store';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { TemplatesService } from '../src/application/templates/templates.service';
import { TrainingService } from '../src/application/training/training.service';
import { DietService } from '../src/application/diet/diet.service';
import { Store } from '../src/application/common/ports';

const coach = { id: 'coach', role: 'Coach' as const };
describe.each(['training', 'diet'] as const)('%s template deletion', (kind) => {
  const model = () => ({
    findUnique: jest
      .fn()
      .mockResolvedValue({
        id: 'template',
        version: 2,
        isTemplate: true,
        clientId: null,
      }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  });
  let tx: {
    trainingPlan: ReturnType<typeof model>;
    dietPlan: ReturnType<typeof model>;
    auditLog: { create: jest.Mock };
  };
  let store: PrismaStore;
  beforeEach(() => {
    tx = {
      trainingPlan: model(),
      dietPlan: model(),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    store = new PrismaStore({
      $transaction: jest.fn(async (run) => run(tx)),
    } as unknown as PrismaService);
  });
  it('deletes only a version-matched template without touching assigned copies', async () => {
    expect(await store.deleteTemplate(coach, kind, 'template', 2)).toBe('ok');
    const selected = kind === 'training' ? tx.trainingPlan : tx.dietPlan;
    const other = kind === 'training' ? tx.dietPlan : tx.trainingPlan;
    expect(selected.deleteMany).toHaveBeenCalledWith({
      where: { id: 'template', version: 2, isTemplate: true, clientId: null },
    });
    expect(other.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'coach',
        action: kind + '.template.delete',
        recordId: 'template',
      },
    });
  });
  it.each([
    null,
    { id: 'client-plan', isTemplate: false, clientId: 'client', version: 2 },
    { id: 'bad-template', isTemplate: true, clientId: 'client', version: 2 },
  ])('refuses missing or client-assigned plans', async (record) => {
    const selected = kind === 'training' ? tx.trainingPlan : tx.dietPlan;
    selected.findUnique.mockResolvedValue(record);
    expect(await store.deleteTemplate(coach, kind, 'template', 2)).toBe(
      'missing',
    );
    expect(selected.deleteMany).not.toHaveBeenCalled();
  });
  it('refuses stale versions and concurrent edits without recording a deletion', async () => {
    const selected = kind === 'training' ? tx.trainingPlan : tx.dietPlan;
    expect(await store.deleteTemplate(coach, kind, 'template', 1)).toBe(
      'conflict',
    );
    expect(selected.deleteMany).not.toHaveBeenCalled();
    selected.deleteMany.mockResolvedValue({ count: 0 });
    expect(await store.deleteTemplate(coach, kind, 'template', 2)).toBe(
      'conflict',
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('enforces coach access and maps missing and stale-version errors', async () => {
    const remove = jest.fn().mockResolvedValue('ok');
    const db = { deleteTemplate: remove } as unknown as Store;
    const service = new TemplatesService(
      db,
      {} as TrainingService,
      {} as DietService,
    );
    expect(
      await service.remove(
        { id: 'client', role: 'Client' },
        kind,
        'template',
        2,
      ),
    ).toMatchObject({ ok: false, error: { status: 403 } });
    expect(remove).not.toHaveBeenCalled();
    for (const [result, status] of [
      ['missing', 404],
      ['conflict', 409],
    ] as const) {
      remove.mockResolvedValue(result);
      expect(await service.remove(coach, kind, 'template', 2)).toMatchObject({
        ok: false,
        error: { status },
      });
    }
  });
});

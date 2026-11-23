import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { PrismaStore } from '../src/infrastructure/database/store';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { TrainingService } from '../src/application/training/training.service';
import { DietService } from '../src/application/diet/diet.service';
import { Store } from '../src/application/common/ports';
import { DeletePlanDto } from '../src/api/dtos';

const coach = { id: 'coach', role: 'Coach' as const };
describe.each(['training', 'diet'] as const)('%s plan deletion', (kind) => {
  let tx: {
    trainingPlan: { findUnique: jest.Mock; deleteMany: jest.Mock };
    dietPlan: { findUnique: jest.Mock; deleteMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let store: PrismaStore;
  beforeEach(() => {
    const model = () => ({
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'plan', version: 2, isTemplate: false }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    });
    tx = {
      trainingPlan: model(),
      dietPlan: model(),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    store = new PrismaStore({
      $transaction: jest.fn(async (run) => run(tx)),
    } as unknown as PrismaService);
  });
  it('deletes only the matching client plan/version and records an audit in the transaction', async () => {
    expect(await store.deleteClientPlan(coach, kind, 'client', 'plan', 2)).toBe(
      'ok',
    );
    const model = kind === 'training' ? tx.trainingPlan : tx.dietPlan;
    const other = kind === 'training' ? tx.dietPlan : tx.trainingPlan;
    expect(model.deleteMany).toHaveBeenCalledWith({
      where: { id: 'plan', clientId: 'client', version: 2, isTemplate: false },
    });
    expect(other.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: { actorId: 'coach', action: kind + '.delete', recordId: 'plan' },
    });
  });
  it.each([
    ['old-plan', 2],
    ['plan', 1],
  ])('rejects stale identity/version (%s, %s)', async (id, version) => {
    expect(
      await store.deleteClientPlan(
        coach,
        kind,
        'client',
        id as string,
        version as number,
      ),
    ).toBe('conflict');
    expect(tx.trainingPlan.deleteMany).not.toHaveBeenCalled();
    expect(tx.dietPlan.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('rejects a concurrent update between lookup and deletion', async () => {
    tx.trainingPlan.deleteMany.mockResolvedValue({ count: 0 });
    tx.dietPlan.deleteMany.mockResolvedValue({ count: 0 });
    expect(await store.deleteClientPlan(coach, kind, 'client', 'plan', 2)).toBe(
      'conflict',
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('returns missing without deleting templates or absent plans', async () => {
    const model = kind === 'training' ? tx.trainingPlan : tx.dietPlan;
    for (const old of [null, { id: 'plan', version: 2, isTemplate: true }]) {
      model.findUnique.mockResolvedValue(old);
      expect(
        await store.deleteClientPlan(coach, kind, 'client', 'plan', 2),
      ).toBe('missing');
    }
    expect(model.deleteMany).not.toHaveBeenCalled();
  });
  it('enforces coach-only application access and maps missing/conflict results', async () => {
    const remove = jest.fn().mockResolvedValue('ok');
    const db = { deleteClientPlan: remove } as unknown as Store;
    const service =
      kind === 'training' ? new TrainingService(db) : new DietService(db);
    expect(
      await service.remove(
        { id: 'client', role: 'Client' },
        'client',
        'plan',
        2,
      ),
    ).toMatchObject({ ok: false, error: { status: 403 } });
    expect(remove).not.toHaveBeenCalled();
    for (const [result, status] of [
      ['missing', 404],
      ['conflict', 409],
    ] as const) {
      remove.mockResolvedValue(result);
      expect(await service.remove(coach, 'client', 'plan', 2)).toMatchObject({
        ok: false,
        error: { status },
      });
    }
  });
});
it('requires a plan UUID and a positive integer version in DELETE payloads', () => {
  const dto = Object.assign(new DeletePlanDto(), {
    planId: 'invalid',
    version: 0,
  });
  expect(
    validateSync(dto)
      .map((error) => error.property)
      .sort(),
  ).toEqual(['planId', 'version']);
});

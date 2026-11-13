import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Store } from '../../application/common/ports';
import {
  Actor,
  CheckInInput,
  DietInput,
  ExerciseInput,
  PageQuery,
  SessionToken,
  TrainingInput,
} from '../../domain/models';
import { PrismaService } from './prisma.service';
import {
  checkInDto,
  checkInInclude,
  clientDto,
  clientInclude,
  dietDto,
  dietInclude,
  exerciseDto,
  trainingDto,
  trainingInclude,
  userDto,
} from './mappers';
import {
  photoRetentionEnded,
  selectionAllowed,
} from '../../domain/rules/access';
import { DateTime } from 'luxon';

const paging = (q: PageQuery) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});
const page = <T>(items: T[], total: number, q: PageQuery) => ({
  items,
  total,
  page: q.page,
  pageSize: q.pageSize,
});
const code = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError ? e.code : '';
function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  recordId: string,
) {
  return tx.auditLog.create({ data: { actorId: actor.id, action, recordId } });
}
@Injectable()
export class PrismaStore implements Store {
  constructor(private readonly db: PrismaService) {}
  async userByEmail(email: string) {
    const u = await this.db.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    return u ? userDto(u) : null;
  }
  async userById(id: string) {
    const u = await this.db.user.findUnique({
      where: { id },
      include: { profile: true },
    });
    return u ? userDto(u) : null;
  }
  async register(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    whatsapp: string;
    consentAt: Date;
  }) {
    try {
      return userDto(
        await this.db.user.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            consentAt: input.consentAt,
            profile: {
              create: { fullName: input.fullName, whatsapp: input.whatsapp },
            },
          },
          include: { profile: true },
        }),
      );
    } catch (e) {
      if (code(e) === 'P2002') return null;
      throw e;
    }
  }
  async loginFailure(id: string, now: Date) {
    await this.db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { failedLogins: { increment: 1 } },
      });
      if (u.failedLogins >= 5)
        await tx.user.update({
          where: { id },
          data: {
            lockedUntil: new Date(now.getTime() + 15 * 60000),
            failedLogins: 0,
          },
        });
    });
  }
  async loginSuccess(id: string) {
    await this.db.user.update({
      where: { id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
  async addSession(token: Omit<SessionToken, 'id' | 'revokedAt'>) {
    await this.db.refreshToken.create({ data: token });
  }
  async session(tokenHash: string) {
    return this.db.refreshToken.findUnique({ where: { tokenHash } });
  }
  async rotateSession(
    oldId: string,
    next: Omit<SessionToken, 'id' | 'revokedAt'>,
    now: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.refreshToken.updateMany({
        where: { id: oldId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (!changed.count) return false;
      await tx.refreshToken.create({ data: next });
      return true;
    });
  }
  async revokeFamily(family: string, now: Date) {
    await this.db.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  async createReset(userId: string, tokenHash: string, expiresAt: Date) {
    await this.db.$transaction(async (tx) => {
      // Lock the user row, serialising reset issuance with password reset.
      await tx.user.update({
        where: { id: userId },
        data: { failedLogins: { increment: 0 } },
      });
      await tx.passwordReset.deleteMany({ where: { userId } });
      await tx.passwordReset.create({ data: { userId, tokenHash, expiresAt } });
    });
  }
  async resetPassword(tokenHash: string, passwordHash: string, now: Date) {
    return this.db.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({ where: { tokenHash } });
      if (!reset || reset.usedAt || reset.expiresAt <= now) return false;
      await tx.user.update({
        where: { id: reset.userId },
        data: { failedLogins: { increment: 0 } },
      });
      const changed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (!changed.count) return false;
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, failedLogins: 0, lockedUntil: null },
      });
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
  }
  async client(id: string) {
    const c = await this.db.clientProfile.findUnique({
      where: { id },
      include: clientInclude,
    });
    return c ? clientDto(c) : null;
  }
  async clients(q: PageQuery, now: Date) {
    const status: Prisma.ClientProfileWhereInput =
      q.status === 'Expired'
        ? {
            status: 'Active',
            OR: [{ accessEndAt: { lte: now } }, { accessEndAt: null }],
          }
        : q.status === 'Active'
          ? { status: 'Active', accessEndAt: { gt: now } }
          : q.status === 'Pending' || q.status === 'Deactivated'
            ? { status: q.status }
            : {};
    const where: Prisma.ClientProfileWhereInput = {
      AND: [
        status,
        q.search
          ? {
              OR: [
                { fullName: { contains: q.search, mode: 'insensitive' } },
                {
                  user: { email: { contains: q.search, mode: 'insensitive' } },
                },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.clientProfile.findMany({
        where,
        ...paging(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: clientInclude,
      }),
      this.db.clientProfile.count({ where }),
    ]);
    return page(items.map(clientDto), total, q);
  }
  async changeAccess(
    actor: Actor,
    id: string,
    version: number,
    change: Parameters<Store['changeAccess']>[3],
  ) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.clientProfile.updateMany({
        where: { id, version },
        data: {
          ...change,
          version: { increment: 1 },
          ...(change.accessEndAt ? { reminderSentFor: null } : {}),
        },
      });
      if (!result.count) return false;
      await audit(
        tx,
        actor,
        `client.${change.status === 'Active' ? 'activate-or-extend' : 'deactivate'}`,
        id,
      );
      return true;
    });
  }
  async exercises(q: PageQuery) {
    const where: Prisma.ExerciseWhereInput = {
      archived: q.archived ?? false,
      ...(q.muscleGroup ? { muscleGroup: q.muscleGroup } : {}),
      ...(q.search
        ? { name: { contains: q.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.exercise.findMany({
        where,
        ...paging(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.exercise.count({ where }),
    ]);
    return page(items.map(exerciseDto), total, q);
  }
  async exercise(id: string) {
    const e = await this.db.exercise.findUnique({ where: { id } });
    return e ? exerciseDto(e) : null;
  }
  async saveExercise(
    actor: Actor,
    input: ExerciseInput,
    id?: string,
    version?: number,
  ) {
    return this.db.$transaction(async (tx) => {
      if (id) {
        if (version === undefined) return null;
        const changed = await tx.exercise.updateMany({
          where: { id, version },
          data: { ...input, version: { increment: 1 } },
        });
        if (!changed.count) return null;
        await audit(tx, actor, 'exercise.update', id);
        return exerciseDto(
          await tx.exercise.findUniqueOrThrow({ where: { id } }),
        );
      }
      const e = await tx.exercise.create({ data: input });
      await audit(tx, actor, 'exercise.create', e.id);
      return exerciseDto(e);
    });
  }
  async archiveExercise(actor: Actor, id: string, version: number) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.exercise.updateMany({
        where: { id, version },
        data: { archived: true, version: { increment: 1 } },
      });
      if (changed.count) await audit(tx, actor, 'exercise.archive', id);
      return !!changed.count;
    });
  }
  async deleteExercise(
    actor: Actor,
    id: string,
    version: number,
  ): ReturnType<Store['deleteExercise']> {
    try {
      return await this.db.$transaction(async (tx) => {
        const changed = await tx.exercise.deleteMany({
          where: { id, version },
        });
        if (!changed.count) return 'conflict';
        await audit(tx, actor, 'exercise.delete', id);
        return 'ok';
      });
    } catch (e) {
      if (code(e) === 'P2003') return 'in-use';
      throw e;
    }
  }
  async training(clientId: string) {
    const p = await this.db.trainingPlan.findUnique({
      where: { clientId },
      include: trainingInclude,
    });
    return p ? trainingDto(p) : null;
  }
  async trainingById(id: string) {
    const p = await this.db.trainingPlan.findUnique({
      where: { id },
      include: trainingInclude,
    });
    return p ? trainingDto(p) : null;
  }
  async diet(clientId: string) {
    const p = await this.db.dietPlan.findUnique({
      where: { clientId },
      include: dietInclude,
    });
    return p ? dietDto(p) : null;
  }
  async dietById(id: string) {
    const p = await this.db.dietPlan.findUnique({
      where: { id },
      include: dietInclude,
    });
    return p ? dietDto(p) : null;
  }
  async saveTraining(
    actor: Actor,
    input: TrainingInput,
    target: { clientId?: string; id?: string; version?: number },
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        const old = target.clientId
          ? await tx.trainingPlan.findUnique({
              where: { clientId: target.clientId },
            })
          : target.id
            ? await tx.trainingPlan.findUnique({ where: { id: target.id } })
            : null;
        if (target.id && (!old || !old.isTemplate)) return null;
        if (
          old &&
          (target.version === undefined || old.version !== target.version)
        )
          return null;
        if (!old && target.version !== undefined) return null;
        const days = {
          create: input.days.map((d) => ({
            name: d.name,
            order: d.order,
            exercises: {
              create: d.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                sets: e.sets,
                reps: e.reps,
                restSeconds: e.restSeconds,
                tempo: e.tempo,
                note: e.note,
                order: e.order,
                alternatives: {
                  create: e.alternatives.map((a) => ({
                    exerciseId: a.exerciseId,
                    sets: a.sets,
                    reps: a.reps,
                    note: a.note,
                  })),
                },
              })),
            },
          })),
        };
        let id: string;
        if (old) {
          const changed = await tx.trainingPlan.updateMany({
            where: { id: old.id, version: target.version },
            data: { name: input.name, version: { increment: 1 } },
          });
          if (!changed.count) return null;
          await tx.planDay.deleteMany({ where: { planId: old.id } });
          await tx.trainingPlan.update({
            where: { id: old.id },
            data: { days },
          });
          id = old.id;
        } else
          id = (
            await tx.trainingPlan.create({
              data: {
                name: input.name,
                clientId: target.clientId,
                isTemplate: !target.clientId,
                days,
              },
            })
          ).id;
        await audit(tx, actor, 'training.save', id);
        return trainingDto(
          await tx.trainingPlan.findUniqueOrThrow({
            where: { id },
            include: trainingInclude,
          }),
        );
      });
    } catch (e) {
      if (code(e) === 'P2002' || code(e) === 'P2034') return null;
      throw e;
    }
  }
  async saveDiet(
    actor: Actor,
    input: DietInput,
    target: { clientId?: string; id?: string; version?: number },
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        const old = target.clientId
          ? await tx.dietPlan.findUnique({
              where: { clientId: target.clientId },
            })
          : target.id
            ? await tx.dietPlan.findUnique({ where: { id: target.id } })
            : null;
        if (target.id && (!old || !old.isTemplate)) return null;
        if (
          old &&
          (target.version === undefined || old.version !== target.version)
        )
          return null;
        if (!old && target.version !== undefined) return null;
        const fields = {
          name: input.name,
          calories: input.calories,
          protein: input.protein,
          carbs: input.carbs,
          fat: input.fat,
        };
        const meals = {
          create: input.meals.map((m) => ({
            name: m.name,
            time: m.time,
            order: m.order,
            options: {
              create: m.options.map((o) => ({
                name: o.name,
                calories: o.calories,
                protein: o.protein,
                carbs: o.carbs,
                fat: o.fat,
                items: {
                  create: o.items.map((i) => ({
                    food: i.food,
                    quantity: i.quantity,
                    unit: i.unit,
                  })),
                },
              })),
            },
          })),
        };
        let id: string;
        if (old) {
          const changed = await tx.dietPlan.updateMany({
            where: { id: old.id, version: target.version },
            data: { ...fields, version: { increment: 1 } },
          });
          if (!changed.count) return null;
          await tx.meal.deleteMany({ where: { planId: old.id } });
          await tx.dietPlan.update({ where: { id: old.id }, data: { meals } });
          id = old.id;
        } else
          id = (
            await tx.dietPlan.create({
              data: {
                ...fields,
                clientId: target.clientId,
                isTemplate: !target.clientId,
                meals,
              },
            })
          ).id;
        // Start each meal on its first approved option.
        const created = await tx.dietPlan.findUniqueOrThrow({
          where: { id },
          include: dietInclude,
        });
        for (const meal of created.meals)
          if (meal.options[0])
            await tx.clientMealSelection.create({
              data: { mealId: meal.id, optionId: meal.options[0].id },
            });
        await audit(tx, actor, 'diet.save', id);
        return dietDto(
          await tx.dietPlan.findUniqueOrThrow({
            where: { id },
            include: dietInclude,
          }),
        );
      });
    } catch (e) {
      if (code(e) === 'P2002' || code(e) === 'P2034') return null;
      throw e;
    }
  }
  async templates(kind: 'training' | 'diet', q: PageQuery) {
    const where = {
      isTemplate: true,
      ...(q.search
        ? { name: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    const select = { id: true, name: true, version: true } as const;
    if (kind === 'training') {
      const [items, total] = await this.db.$transaction([
        this.db.trainingPlan.findMany({
          where,
          select,
          ...paging(q),
          orderBy: { id: 'asc' },
        }),
        this.db.trainingPlan.count({ where }),
      ]);
      return page(items, total, q);
    }
    const [items, total] = await this.db.$transaction([
      this.db.dietPlan.findMany({
        where,
        select,
        ...paging(q),
        orderBy: { id: 'asc' },
      }),
      this.db.dietPlan.count({ where }),
    ]);
    return page(items, total, q);
  }
  async chooseExercise(
    actor: Actor,
    clientId: string,
    placementId: string,
    alternativeId: string | null,
    version: number,
    lock?: boolean,
  ): ReturnType<Store['chooseExercise']> {
    return this.db.$transaction(async (tx) => {
      const p = await tx.trainingPlan.findUnique({ where: { clientId } });
      if (!p) return 'missing';
      if (p.version !== version) return 'conflict';
      const e = await tx.planExercise.findFirst({
        where: { id: placementId, day: { planId: p.id } },
        include: { alternatives: true },
      });
      if (
        !e ||
        (alternativeId && !e.alternatives.some((a) => a.id === alternativeId))
      )
        return 'missing';
      if (
        !selectionAllowed(
          p.choicesLocked || e.choicesLocked,
          actor.role === 'Coach',
        ).ok
      )
        return 'locked';
      if (
        !(
          await tx.trainingPlan.updateMany({
            where: { id: p.id, version },
            data: { version: { increment: 1 } },
          })
        ).count
      )
        return 'conflict';
      await tx.planExercise.update({
        where: { id: e.id },
        data: {
          selectedAlternativeId: alternativeId,
          ...(actor.role === 'Coach' && lock !== undefined
            ? { choicesLocked: lock }
            : {}),
        },
      });
      if (actor.role === 'Coach')
        await audit(tx, actor, 'training.choice', e.id);
      return 'ok';
    });
  }
  async chooseMeal(
    actor: Actor,
    clientId: string,
    mealId: string,
    optionId: string,
    version: number,
    lock?: boolean,
  ): ReturnType<Store['chooseMeal']> {
    return this.db.$transaction(async (tx) => {
      const p = await tx.dietPlan.findUnique({ where: { clientId } });
      if (!p) return 'missing';
      if (p.version !== version) return 'conflict';
      const meal = await tx.meal.findFirst({
        where: { id: mealId, planId: p.id },
        include: { selection: true, options: { select: { id: true } } },
      });
      if (!meal || !meal.options.some((o) => o.id === optionId))
        return 'missing';
      if (
        !selectionAllowed(
          p.choicesLocked || !!meal.selection?.locked,
          actor.role === 'Coach',
        ).ok
      )
        return 'locked';
      if (
        !(
          await tx.dietPlan.updateMany({
            where: { id: p.id, version },
            data: { version: { increment: 1 } },
          })
        ).count
      )
        return 'conflict';
      await tx.clientMealSelection.upsert({
        where: { mealId },
        create: {
          mealId,
          optionId,
          locked: actor.role === 'Coach' ? (lock ?? false) : false,
        },
        update: {
          optionId,
          ...(actor.role === 'Coach' && lock !== undefined
            ? { locked: lock }
            : {}),
        },
      });
      if (actor.role === 'Coach') await audit(tx, actor, 'diet.choice', mealId);
      return 'ok';
    });
  }
  async lockPlan(
    actor: Actor,
    kind: 'training' | 'diet',
    clientId: string,
    locked: boolean,
    version: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const args = {
        where: { clientId, version },
        data: { choicesLocked: locked, version: { increment: 1 } },
      };
      const changed =
        kind === 'training'
          ? await tx.trainingPlan.updateMany(args)
          : await tx.dietPlan.updateMany(args);
      if (changed.count) await audit(tx, actor, `${kind}.lock`, clientId);
      return !!changed.count;
    });
  }
  async checkIn(
    clientId: string,
    input: CheckInInput,
    recordedAt: Date,
    localDate: string,
  ) {
    return checkInDto(
      await this.db.checkIn.create({
        data: { clientId, ...input, recordedAt, localDate },
        include: checkInInclude,
      }),
    );
  }
  async checkIns(clientId: string, q: PageQuery) {
    const [items, total] = await this.db.$transaction([
      this.db.checkIn.findMany({
        where: { clientId },
        ...paging(q),
        orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
        include: checkInInclude,
      }),
      this.db.checkIn.count({ where: { clientId } }),
    ]);
    return page(items.map(checkInDto), total, q);
  }
  async workouts(clientId: string, q: PageQuery) {
    const [items, total] = await this.db.$transaction([
      this.db.workoutLog.findMany({
        where: { clientId },
        ...paging(q),
        orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.workoutLog.count({ where: { clientId } }),
    ]);
    return page(
      items.map((w) => ({
        id: w.id,
        clientId: w.clientId,
        planExerciseId: w.planExerciseId,
        exerciseId: w.exerciseId,
        exerciseName: w.exerciseName,
        alternativeId: w.alternativeId,
        sets: w.sets,
        reps: w.reps,
        recordedAt: w.recordedAt,
        localDate: w.localDate,
      })),
      total,
      q,
    );
  }
  async logWorkout(
    clientId: string,
    placementId: string,
    alternativeId: string | null,
    recordedAt: Date,
    localDate: string,
  ): ReturnType<Store['logWorkout']> {
    return this.db.$transaction(async (tx) => {
      const plan = await tx.trainingPlan.findUnique({ where: { clientId } });
      if (!plan) return 'missing';
      // Lock the plan row so edits/choice locks cannot race this insert.
      await tx.trainingPlan.update({
        where: { id: plan.id },
        data: { version: { increment: 0 } },
      });
      const fresh = await tx.trainingPlan.findUniqueOrThrow({
        where: { id: plan.id },
      });
      const e = await tx.planExercise.findFirst({
        where: { id: placementId, day: { planId: plan.id } },
        include: {
          exercise: true,
          alternatives: { include: { exercise: true } },
        },
      });
      if (!e) return 'missing';
      const alternative = alternativeId
        ? e.alternatives.find((a) => a.id === alternativeId)
        : null;
      if (alternativeId && !alternative) return 'missing';
      if (
        (fresh.choicesLocked || e.choicesLocked) &&
        alternativeId !== e.selectedAlternativeId
      )
        return 'locked';
      const exercise = alternative?.exercise ?? e.exercise;
      const w = await tx.workoutLog.create({
        data: {
          clientId,
          planExerciseId: e.id,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          alternativeId,
          sets: alternative?.sets ?? e.sets,
          reps: alternative?.reps ?? e.reps,
          recordedAt,
          localDate,
        },
      });
      return {
        id: w.id,
        clientId: w.clientId,
        planExerciseId: w.planExerciseId,
        exerciseId: w.exerciseId,
        exerciseName: w.exerciseName,
        alternativeId: w.alternativeId,
        sets: w.sets,
        reps: w.reps,
        recordedAt: w.recordedAt,
        localDate: w.localDate,
      };
    });
  }
  async feedback(
    actor: Actor,
    clientId: string,
    checkInId: string,
    text: string,
    version: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.checkIn.updateMany({
        where: { id: checkInId, clientId, version },
        data: { feedback: text, version: { increment: 1 } },
      });
      if (changed.count) await audit(tx, actor, 'progress.feedback', checkInId);
      return !!changed.count;
    });
  }
  async ownsCheckIn(clientId: string, checkInId: string) {
    return !!(await this.db.checkIn.findFirst({
      where: { id: checkInId, clientId },
      select: { id: true },
    }));
  }
  async addPhoto(checkInId: string, publicId: string) {
    return this.db.progressPhoto.create({
      data: { checkInId, publicId },
      select: { id: true },
    });
  }
  async photo(clientId: string, photoId: string) {
    return this.db.progressPhoto.findFirst({
      where: { id: photoId, checkIn: { clientId } },
      select: { id: true, publicId: true },
    });
  }
  async removePhoto(id: string) {
    await this.db.progressPhoto.deleteMany({ where: { id } });
  }
  async clientPhotos(clientId: string) {
    return this.db.progressPhoto.findMany({
      where: { checkIn: { clientId } },
      select: { id: true, publicId: true },
    });
  }
  async exportClient(actor: Actor, clientId: string) {
    return this.db.$transaction(async (tx) => {
      const c = await tx.clientProfile.findUniqueOrThrow({
        where: { id: clientId },
        include: {
          ...clientInclude,
          user: { select: { email: true, consentAt: true, createdAt: true } },
          trainingPlan: { include: trainingInclude },
          dietPlan: { include: dietInclude },
          checkIns: { include: checkInInclude },
          workoutLogs: true,
        },
      });
      await audit(tx, actor, 'client.export', clientId);
      return {
        profile: clientDto(c),
        consentAt: c.user.consentAt,
        training: c.trainingPlan ? trainingDto(c.trainingPlan) : null,
        diet: c.dietPlan ? dietDto(c.dietPlan) : null,
        checkIns: c.checkIns.map(checkInDto),
        workouts: c.workoutLogs.map((w) => ({
          id: w.id,
          exerciseName: w.exerciseName,
          sets: w.sets,
          reps: w.reps,
          localDate: w.localDate,
          recordedAt: w.recordedAt,
        })),
        photos: c.checkIns.flatMap((ci) =>
          ci.photos.map((p) => ({ id: p.id, checkInId: ci.id })),
        ),
      };
    });
  }
  async deleteClient(actor: Actor, clientId: string) {
    await this.db.$transaction(async (tx) => {
      const c = await tx.clientProfile.findUniqueOrThrow({
        where: { id: clientId },
      });
      await audit(tx, actor, 'client.delete', clientId);
      await tx.user.delete({ where: { id: c.userId } });
    });
  }
  async reminderCandidates(localDate: string, now: Date) {
    const until = DateTime.fromISO(localDate, { zone: 'Africa/Cairo' })
      .endOf('day')
      .toJSDate();
    const rows = await this.db.clientProfile.findMany({
      where: { status: 'Active', accessEndAt: { gt: now, lte: until } },
      include: clientInclude,
    });
    // Include overdue reminders so a failed delivery can be retried on the next day.
    return rows
      .filter(
        (c) =>
          c.accessEndAt &&
          c.reminderSentFor?.getTime() !== c.accessEndAt.getTime(),
      )
      .map(clientDto);
  }
  async markReminder(id: string, end: Date) {
    await this.db.clientProfile.updateMany({
      where: { id, accessEndAt: end, status: 'Active' },
      data: { reminderSentFor: end },
    });
  }
  async cleanupCandidates(now: Date) {
    return (
      await this.db.clientProfile.findMany({
        where: {
          OR: [
            {
              status: 'Deactivated',
              deactivatedAt: { lte: new Date(now.getTime() - 7 * 86400000) },
            },
            {
              status: 'Active',
              accessEndAt: { lte: new Date(now.getTime() - 7 * 86400000) },
            },
          ],
        },
        include: clientInclude,
      })
    )
      .filter((c) => photoRetentionEnded(c, now))
      .map(clientDto);
  }
  async housekeeping(now: Date, auditBefore: Date) {
    // Keep consumed tokens while any descendant could still be valid, preserving reuse detection.
    const expired = await this.db.refreshToken.groupBy({
      by: ['family'],
      _max: { expiresAt: true },
      having: { expiresAt: { _max: { lt: now } } },
    });
    if (expired.length)
      await this.db.refreshToken.deleteMany({
        where: { family: { in: expired.map((f) => f.family) } },
      });
    await this.db.passwordReset.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    await this.db.auditLog.deleteMany({
      where: { createdAt: { lt: auditBefore } },
    });
  }
  async healthy() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

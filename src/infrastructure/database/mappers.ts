import { Prisma } from '@prisma/client';
import {
  CheckIn,
  Client,
  Diet,
  Exercise,
  Training,
  User,
} from '../../domain/models';
export const clientInclude = {
  user: { select: { email: true } },
} satisfies Prisma.ClientProfileInclude;
export function clientDto(
  c: Prisma.ClientProfileGetPayload<{ include: typeof clientInclude }>,
): Client {
  return {
    id: c.id,
    userId: c.userId,
    email: c.user.email,
    fullName: c.fullName,
    whatsapp: c.whatsapp,
    package: c.package,
    status: c.status,
    accessEndAt: c.accessEndAt,
    deactivatedAt: c.deactivatedAt,
    activatedAt: c.activatedAt,
    createdAt: c.createdAt,
    version: c.version,
  };
}
export function userDto(
  u: Prisma.UserGetPayload<{ include: { profile: true } }>,
): User {
  return {
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash,
    role: u.role,
    failedLogins: u.failedLogins,
    lockedUntil: u.lockedUntil,
    clientId: u.profile?.id,
  };
}
export function exerciseDto(e: Prisma.ExerciseGetPayload<object>): Exercise {
  return {
    id: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup,
    youtubeVideoId: e.youtubeVideoId,
    notes: e.notes ?? undefined,
    archived: e.archived,
    version: e.version,
  };
}
export const trainingInclude = {
  days: {
    orderBy: { order: 'asc' },
    include: {
      exercises: {
        orderBy: { order: 'asc' },
        include: {
          exercise: true,
          alternatives: { include: { exercise: true } },
        },
      },
    },
  },
} satisfies Prisma.TrainingPlanInclude;
export function trainingDto(
  p: Prisma.TrainingPlanGetPayload<{ include: typeof trainingInclude }>,
): Training {
  return {
    id: p.id,
    clientId: p.clientId,
    name: p.name,
    isTemplate: p.isTemplate,
    choicesLocked: p.choicesLocked,
    version: p.version,
    days: p.days.map((d) => ({
      id: d.id,
      name: d.name,
      order: d.order,
      exercises: d.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        sets: e.sets,
        reps: e.reps,
        restSeconds: e.restSeconds,
        tempo: e.tempo ?? undefined,
        note: e.note ?? undefined,
        order: e.order,
        choicesLocked: e.choicesLocked,
        selectedAlternativeId: e.selectedAlternativeId,
        exercise: exerciseDto(e.exercise),
        alternatives: e.alternatives.map((a) => ({
          id: a.id,
          exerciseId: a.exerciseId,
          sets: a.sets ?? undefined,
          reps: a.reps ?? undefined,
          note: a.note ?? undefined,
          exercise: exerciseDto(a.exercise),
        })),
      })),
    })),
  };
}
export const dietInclude = {
  meals: {
    orderBy: { order: 'asc' },
    include: { options: { include: { items: true } }, selection: true },
  },
} satisfies Prisma.DietPlanInclude;
export function dietDto(
  p: Prisma.DietPlanGetPayload<{ include: typeof dietInclude }>,
): Diet {
  return {
    id: p.id,
    clientId: p.clientId,
    name: p.name,
    isTemplate: p.isTemplate,
    choicesLocked: p.choicesLocked,
    version: p.version,
    calories: p.calories,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    meals: p.meals.map((m) => ({
      id: m.id,
      name: m.name,
      time: m.time,
      order: m.order,
      options: m.options.map((o) => ({
        id: o.id,
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
      selection: m.selection
        ? { optionId: m.selection.optionId, locked: m.selection.locked }
        : null,
    })),
  };
}
export const checkInInclude = {
  photos: { select: { id: true } },
} satisfies Prisma.CheckInInclude;
export function checkInDto(
  c: Prisma.CheckInGetPayload<{ include: typeof checkInInclude }>,
): CheckIn {
  return {
    id: c.id,
    clientId: c.clientId,
    weight: c.weight,
    measurements: c.measurements as Record<string, number>,
    energy: c.energy,
    notes: c.notes ?? undefined,
    feedback: c.feedback,
    version: c.version,
    recordedAt: c.recordedAt,
    localDate: c.localDate,
    photos: c.photos,
  };
}

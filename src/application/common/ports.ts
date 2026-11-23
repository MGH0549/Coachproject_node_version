import {
  Actor,
  CheckIn,
  CheckInInput,
  Client,
  ClientExport,
  Diet,
  DietInput,
  Exercise,
  ExerciseInput,
  Page,
  PageQuery,
  SessionToken,
  Training,
  TrainingInput,
  User,
  Workout,
  StrengthInput,
  StrengthEdit,
  StrengthSession,
} from '../../domain/models';
export interface Clock {
  now(): Date;
  endOfDay(date: string): Date | null;
  localDate(moment: Date): string;
  addDays(date: string, days: number): string;
}
export interface Crypto {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  random(): string;
  digest(token: string): string;
  uuid(): string;
}
export interface AccessTokens {
  sign(user: User): Promise<string>;
}
export interface Mail {
  reset(email: string, token: string): Promise<void>;
  reminder(email: string, name: string, end: Date): Promise<void>;
}
export interface Photos {
  upload(clientId: string, data: Buffer): Promise<string>;
  remove(publicId: string): Promise<void>;
  url(publicId: string): string;
}
export interface Settings {
  whatsapp: string;
  reminderLeadDays: number;
  auditRetentionDays: number;
}
export interface Store {
  userByEmail(email: string): Promise<User | null>;
  userById(id: string): Promise<User | null>;
  register(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    whatsapp: string;
    consentAt: Date;
  }): Promise<User | null>;
  loginFailure(id: string, now: Date): Promise<void>;
  loginSuccess(id: string): Promise<void>;
  addSession(token: Omit<SessionToken, 'id' | 'revokedAt'>): Promise<void>;
  session(hash: string): Promise<SessionToken | null>;
  rotateSession(
    oldId: string,
    next: Omit<SessionToken, 'id' | 'revokedAt'>,
    now: Date,
  ): Promise<boolean>;
  revokeFamily(family: string, now: Date): Promise<void>;
  createReset(userId: string, hash: string, expiresAt: Date): Promise<void>;
  resetPassword(
    hash: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean>;
  client(id: string): Promise<Client | null>;
  clients(query: PageQuery, now: Date): Promise<Page<Client>>;
  changeAccess(
    actor: Actor,
    id: string,
    version: number,
    change: {
      status: 'Active' | 'Deactivated';
      accessEndAt?: Date;
      package?: string;
      activatedAt?: Date;
      deactivatedAt: Date | null;
    },
  ): Promise<boolean>;
  exercises(query: PageQuery): Promise<Page<Exercise>>;
  exercise(id: string): Promise<Exercise | null>;
  saveExercise(
    actor: Actor,
    input: ExerciseInput,
    id?: string,
    version?: number,
  ): Promise<Exercise | null>;
  archiveExercise(actor: Actor, id: string, version: number): Promise<boolean>;
  deleteExercise(
    actor: Actor,
    id: string,
    version: number,
  ): Promise<'ok' | 'conflict' | 'in-use'>;
  deleteClientPlan(
    actor: Actor,
    kind: 'training' | 'diet',
    clientId: string,
    planId: string,
    version: number,
  ): Promise<'ok' | 'missing' | 'conflict'>;
  deleteTemplate(
    actor: Actor,
    kind: 'training' | 'diet',
    id: string,
    version: number,
  ): Promise<'ok' | 'missing' | 'conflict'>;
  training(clientId: string): Promise<Training | null>;
  trainingById(id: string): Promise<Training | null>;
  diet(clientId: string): Promise<Diet | null>;
  dietById(id: string): Promise<Diet | null>;
  saveTraining(
    actor: Actor,
    input: TrainingInput,
    target: { clientId?: string; id?: string; version?: number },
  ): Promise<Training | null>;
  saveDiet(
    actor: Actor,
    input: DietInput,
    target: { clientId?: string; id?: string; version?: number },
  ): Promise<Diet | null>;
  templates(
    kind: 'training' | 'diet',
    query: PageQuery,
  ): Promise<Page<{ id: string; name: string; version: number }>>;
  chooseExercise(
    actor: Actor,
    clientId: string,
    placementId: string,
    alternativeId: string | null,
    version: number,
    lock?: boolean,
  ): Promise<'ok' | 'conflict' | 'locked' | 'missing'>;
  chooseMeal(
    actor: Actor,
    clientId: string,
    mealId: string,
    optionId: string,
    version: number,
    lock?: boolean,
  ): Promise<'ok' | 'conflict' | 'locked' | 'missing'>;
  lockPlan(
    actor: Actor,
    kind: 'training' | 'diet',
    clientId: string,
    locked: boolean,
    version: number,
  ): Promise<boolean>;
  checkIn(
    clientId: string,
    input: CheckInInput,
    now: Date,
    localDate: string,
  ): Promise<CheckIn>;
  checkIns(clientId: string, query: PageQuery): Promise<Page<CheckIn>>;
  workouts(clientId: string, query: PageQuery): Promise<Page<Workout>>;
  saveStrength(
    clientId: string,
    input: StrengthInput,
    now: Date,
    localDate: string,
  ): Promise<StrengthSession | 'missing' | 'locked' | 'limit'>;
  editStrength(
    clientId: string,
    id: string,
    input: StrengthEdit,
  ): Promise<StrengthSession | 'missing' | 'limit'>;
  deleteStrength(clientId: string, id: string): Promise<boolean>;
  strengthHistory(
    clientId: string,
    query: PageQuery,
    exerciseId?: string,
  ): Promise<Page<StrengthSession>>;
  strengthSessions(clientId: string): Promise<StrengthSession[]>;
  logWorkout(
    clientId: string,
    placementId: string,
    alternativeId: string | null,
    now: Date,
    localDate: string,
  ): Promise<'missing' | 'locked' | Workout>;
  feedback(
    actor: Actor,
    clientId: string,
    checkInId: string,
    text: string,
    version: number,
  ): Promise<boolean>;
  ownsCheckIn(clientId: string, checkInId: string): Promise<boolean>;
  addPhoto(checkInId: string, publicId: string): Promise<{ id: string }>;
  photo(
    clientId: string,
    photoId: string,
  ): Promise<{ id: string; publicId: string } | null>;
  removePhoto(id: string): Promise<void>;
  clientPhotos(clientId: string): Promise<{ id: string; publicId: string }[]>;
  exportClient(actor: Actor, clientId: string): Promise<ClientExport>;
  deleteClient(actor: Actor, clientId: string): Promise<void>;
  reminderCandidates(localDate: string, now: Date): Promise<Client[]>;
  markReminder(id: string, end: Date): Promise<void>;
  cleanupCandidates(now: Date): Promise<Client[]>;
  housekeeping(now: Date, auditBefore: Date): Promise<void>;
  healthy(): Promise<boolean>;
}

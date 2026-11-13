export type Role = 'Coach' | 'Client';
export type Status = 'Pending' | 'Active' | 'Deactivated';
export interface Actor {
  id: string;
  role: Role;
  clientId?: string;
}
export interface ClientAccess {
  status: Status;
  accessEndAt: Date | null;
  deactivatedAt: Date | null;
}
export interface Client extends ClientAccess {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  whatsapp: string;
  package: string | null;
  activatedAt: Date | null;
  createdAt: Date;
  version: number;
}
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  failedLogins: number;
  lockedUntil: Date | null;
  clientId?: string;
}
export interface SessionToken {
  id: string;
  userId: string;
  family: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
export interface ExerciseInput {
  name: string;
  muscleGroup: string;
  youtubeVideoId: string;
  notes?: string;
}
export interface Exercise extends ExerciseInput {
  id: string;
  archived: boolean;
  version: number;
}
export interface AlternativeInput {
  exerciseId: string;
  sets?: number;
  reps?: string;
  note?: string;
}
export interface PlacementInput {
  exerciseId: string;
  sets: number;
  reps: string;
  restSeconds: number;
  tempo?: string;
  note?: string;
  order: number;
  alternatives: AlternativeInput[];
}
export interface TrainingInput {
  name: string;
  days: { name: string; order: number; exercises: PlacementInput[] }[];
}
export interface Alternative extends AlternativeInput {
  id: string;
  exercise: Exercise;
}
export interface Placement extends Omit<PlacementInput, 'alternatives'> {
  id: string;
  choicesLocked: boolean;
  selectedAlternativeId: string | null;
  exercise: Exercise;
  alternatives: Alternative[];
}
export interface Training {
  id: string;
  clientId: string | null;
  name: string;
  isTemplate: boolean;
  choicesLocked: boolean;
  version: number;
  days: { id: string; name: string; order: number; exercises: Placement[] }[];
}
export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface OptionInput extends Macros {
  name: string;
  items: { food: string; quantity: number; unit: string }[];
}
export interface DietInput extends Macros {
  name: string;
  meals: {
    name: string;
    time?: string;
    order: number;
    options: OptionInput[];
  }[];
}
export interface Diet extends Macros {
  id: string;
  clientId: string | null;
  name: string;
  isTemplate: boolean;
  choicesLocked: boolean;
  version: number;
  meals: {
    id: string;
    name: string;
    time: string | null;
    order: number;
    options: (OptionInput & { id: string })[];
    selection: { optionId: string; locked: boolean } | null;
  }[];
}
export interface CheckInInput {
  weight: number;
  measurements: Record<string, number>;
  energy: number;
  notes?: string;
}
export interface CheckIn extends CheckInInput {
  id: string;
  clientId: string;
  feedback: string | null;
  version: number;
  recordedAt: Date;
  localDate: string;
  photos: { id: string }[];
}
export interface Workout {
  id: string;
  clientId: string;
  planExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  alternativeId: string | null;
  sets: number;
  reps: string;
  recordedAt: Date;
  localDate: string;
}
export interface PageQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  muscleGroup?: string;
  archived?: boolean;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ClientExport {
  profile: Client;
  consentAt: Date;
  training: Training | null;
  diet: Diet | null;
  checkIns: CheckIn[];
  workouts: Pick<
    Workout,
    'id' | 'exerciseName' | 'sets' | 'reps' | 'localDate' | 'recordedAt'
  >[];
  photos: { id: string; checkInId: string }[];
}

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Coach', 'Client');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('Pending', 'Active', 'Deactivated');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Client',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "package" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'Pending',
    "accessEndAt" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "deactivatedAt" TIMESTAMPTZ(3),
    "reminderSentFor" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "family" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" UUID NOT NULL,
    "clientId" UUID,
    "name" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "choicesLocked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDay" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "PlanDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanExercise" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "restSeconds" INTEGER NOT NULL,
    "tempo" TEXT,
    "note" TEXT,
    "order" INTEGER NOT NULL,
    "choicesLocked" BOOLEAN NOT NULL DEFAULT false,
    "selectedAlternativeId" UUID,

    CONSTRAINT "PlanExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAlternative" (
    "id" UUID NOT NULL,
    "planExerciseId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "sets" INTEGER,
    "reps" TEXT,
    "note" TEXT,

    CONSTRAINT "ExerciseAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietPlan" (
    "id" UUID NOT NULL,
    "clientId" UUID,
    "name" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "choicesLocked" BOOLEAN NOT NULL DEFAULT false,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealOption" (
    "id" UUID NOT NULL,
    "mealId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MealOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealOptionItem" (
    "id" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "food" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "MealOptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientMealSelection" (
    "id" UUID NOT NULL,
    "mealId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClientMealSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "measurements" JSONB NOT NULL,
    "energy" INTEGER NOT NULL,
    "notes" TEXT,
    "feedback" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localDate" TEXT NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressPhoto" (
    "id" UUID NOT NULL,
    "checkInId" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutLog" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "planExerciseId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "alternativeId" UUID,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localDate" TEXT NOT NULL,

    CONSTRAINT "WorkoutLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");

-- CreateIndex
CREATE INDEX "ClientProfile_status_createdAt_idx" ON "ClientProfile"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ClientProfile_accessEndAt_idx" ON "ClientProfile"("accessEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_family_idx" ON "RefreshToken"("family");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Exercise_archived_muscleGroup_idx" ON "Exercise"("archived", "muscleGroup");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlan_clientId_key" ON "TrainingPlan"("clientId");

-- CreateIndex
CREATE INDEX "TrainingPlan_isTemplate_idx" ON "TrainingPlan"("isTemplate");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDay_planId_order_key" ON "PlanDay"("planId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PlanExercise_dayId_order_key" ON "PlanExercise"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAlternative_planExerciseId_exerciseId_key" ON "ExerciseAlternative"("planExerciseId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "DietPlan_clientId_key" ON "DietPlan"("clientId");

-- CreateIndex
CREATE INDEX "DietPlan_isTemplate_idx" ON "DietPlan"("isTemplate");

-- CreateIndex
CREATE UNIQUE INDEX "Meal_planId_order_key" ON "Meal"("planId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMealSelection_mealId_key" ON "ClientMealSelection"("mealId");

-- CreateIndex
CREATE INDEX "CheckIn_clientId_recordedAt_idx" ON "CheckIn"("clientId", "recordedAt");

-- CreateIndex
CREATE INDEX "CheckIn_clientId_localDate_idx" ON "CheckIn"("clientId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressPhoto_publicId_key" ON "ProgressPhoto"("publicId");

-- CreateIndex
CREATE INDEX "ProgressPhoto_checkInId_idx" ON "ProgressPhoto"("checkInId");

-- CreateIndex
CREATE INDEX "WorkoutLog_clientId_recordedAt_idx" ON "WorkoutLog"("clientId", "recordedAt");

-- CreateIndex
CREATE INDEX "WorkoutLog_clientId_localDate_idx" ON "WorkoutLog"("clientId", "localDate");

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDay" ADD CONSTRAINT "PlanDay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanExercise" ADD CONSTRAINT "PlanExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "PlanDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanExercise" ADD CONSTRAINT "PlanExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlternative" ADD CONSTRAINT "ExerciseAlternative_planExerciseId_fkey" FOREIGN KEY ("planExerciseId") REFERENCES "PlanExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlternative" ADD CONSTRAINT "ExerciseAlternative_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DietPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealOption" ADD CONSTRAINT "MealOption_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealOptionItem" ADD CONSTRAINT "MealOptionItem_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MealOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMealSelection" ADD CONSTRAINT "ClientMealSelection_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMealSelection" ADD CONSTRAINT "ClientMealSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MealOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkoutLog" ADD COLUMN "note" TEXT;

CREATE TABLE "WorkoutSet" (
    "id" UUID NOT NULL,
    "workoutLogId" UUID NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weightKg" DECIMAL(5,2) NOT NULL,
    "repetitions" INTEGER NOT NULL,
    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkoutSet_setNumber_check" CHECK ("setNumber" BETWEEN 1 AND 10),
    CONSTRAINT "WorkoutSet_weightKg_check" CHECK ("weightKg" BETWEEN 0 AND 500 AND MOD("weightKg", 0.25) = 0),
    CONSTRAINT "WorkoutSet_repetitions_check" CHECK ("repetitions" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "WorkoutSet_workoutLogId_setNumber_key" ON "WorkoutSet"("workoutLogId", "setNumber");
CREATE INDEX "WorkoutLog_clientId_exerciseId_recordedAt_id_idx" ON "WorkoutLog"("clientId", "exerciseId", "recordedAt", "id");
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

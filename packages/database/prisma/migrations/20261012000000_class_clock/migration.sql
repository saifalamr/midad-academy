ALTER TABLE "ClassSession" ADD COLUMN "startedAt" TIMESTAMP(3), ADD COLUMN "phaseMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[], ADD COLUMN "clockVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "ClassSession" SET "startedAt" = "updatedAt" WHERE status = 'LIVE';

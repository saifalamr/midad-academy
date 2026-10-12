ALTER TABLE "ClassSession" ADD COLUMN "microphoneVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClassSession" ADD COLUMN "endedAt" TIMESTAMP(3);
CREATE TABLE "SessionSpeakingPermission" (
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "SessionSpeakingPermission_pkey" PRIMARY KEY ("sessionId", "userId")
);
CREATE INDEX "SessionSpeakingPermission_userId_idx" ON "SessionSpeakingPermission"("userId");
ALTER TABLE "SessionSpeakingPermission" ADD CONSTRAINT "SessionSpeakingPermission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionSpeakingPermission" ADD CONSTRAINT "SessionSpeakingPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ClassroomVisit" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "participantSid" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "exitSource" TEXT,
  CONSTRAINT "ClassroomVisit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassroomVisit_sessionId_participantSid_key" ON "ClassroomVisit"("sessionId", "participantSid");
CREATE INDEX "ClassroomVisit_sessionId_userId_idx" ON "ClassroomVisit"("sessionId", "userId");
CREATE INDEX "ClassroomVisit_userId_idx" ON "ClassroomVisit"("userId");
ALTER TABLE "ClassroomVisit" ADD CONSTRAINT "ClassroomVisit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomVisit" ADD CONSTRAINT "ClassroomVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SessionReport" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "performance" TEXT NOT NULL DEFAULT 'NOT_ASSESSED',
  "participationCount" INTEGER NOT NULL DEFAULT 0,
  "homework" TEXT NOT NULL DEFAULT 'NOT_ASSIGNED',
  "note" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SessionReport_sessionId_studentId_key" ON "SessionReport"("sessionId", "studentId");
CREATE INDEX "SessionReport_studentId_publishedAt_idx" ON "SessionReport"("studentId", "publishedAt");

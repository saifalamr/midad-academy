CREATE TABLE "SessionHomework" (
 "sessionId" TEXT NOT NULL PRIMARY KEY,
 "title" TEXT NOT NULL,
 "questions" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "HomeworkSubmission" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "sessionId" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "answers" JSONB NOT NULL,
 "grades" JSONB NOT NULL,
 "feedback" TEXT NOT NULL DEFAULT '',
 "version" INTEGER NOT NULL DEFAULT 1,
 "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "publishedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "HomeworkSubmission_sessionId_studentId_key" ON "HomeworkSubmission"("sessionId", "studentId");
CREATE INDEX "HomeworkSubmission_studentId_submittedAt_idx" ON "HomeworkSubmission"("studentId", "submittedAt");
ALTER TABLE "SessionHomework" ADD CONSTRAINT "SessionHomework_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SessionHomework"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

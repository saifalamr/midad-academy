ALTER TABLE "HomeworkSubmission" ADD COLUMN "reviewedAudio" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "HomeworkAudio" (
 "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "questionId" TEXT NOT NULL,
 "publicId" TEXT NOT NULL, "format" TEXT NOT NULL, "duration" DOUBLE PRECISION NOT NULL, "bytes" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "HomeworkAudio_sessionId_studentId_questionId_key" ON "HomeworkAudio"("sessionId", "studentId", "questionId");
CREATE INDEX "HomeworkAudio_studentId_idx" ON "HomeworkAudio"("studentId");
ALTER TABLE "HomeworkAudio" ADD CONSTRAINT "HomeworkAudio_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkAudio" ADD CONSTRAINT "HomeworkAudio_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

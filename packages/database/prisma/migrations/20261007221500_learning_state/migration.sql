CREATE TABLE "LearningState" (
  "studentId" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "note" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningState_pkey" PRIMARY KEY ("studentId", "contentId")
);
CREATE INDEX "LearningState_contentId_idx" ON "LearningState"("contentId");
ALTER TABLE "LearningState" ADD CONSTRAINT "LearningState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningState" ADD CONSTRAINT "LearningState_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CourseContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

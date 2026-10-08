ALTER TABLE "Quiz" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StudentQuizResult" ADD COLUMN "submissionKey" TEXT, ADD COLUMN "passingScoreSnapshot" INTEGER, ADD COLUMN "quizTitleSnapshot" TEXT;
ALTER TABLE "StudentAnswer" ADD COLUMN "questionTextSnapshot" TEXT, ADD COLUMN "questionTypeSnapshot" "QuestionType", ADD COLUMN "maxPointsSnapshot" INTEGER, ADD COLUMN "correctAnswerSnapshot" TEXT;
UPDATE "StudentQuizResult" AS r SET "passingScoreSnapshot" = q."passingScore", "quizTitleSnapshot" = q."title" FROM "Quiz" AS q WHERE q.id = r."quizId";
UPDATE "StudentAnswer" AS a SET "questionTextSnapshot" = q.text, "questionTypeSnapshot" = q."questionType", "maxPointsSnapshot" = q.points, "correctAnswerSnapshot" = q."correctAnswer" FROM "Question" AS q WHERE q.id = a."questionId";
CREATE UNIQUE INDEX "StudentQuizResult_studentId_quizId_submissionKey_key" ON "StudentQuizResult"("studentId", "quizId", "submissionKey");

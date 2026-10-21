-- CreateTable
CREATE TABLE "WritingTemplate" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "fontSize" INTEGER NOT NULL DEFAULT 140,
    "mode" TEXT NOT NULL DEFAULT 'SIMPLE',
    "guides" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingTask" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "fontSize" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "guides" JSONB NOT NULL,
    "useAs" TEXT NOT NULL DEFAULT 'ACTIVITY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "strokes" JSONB NOT NULL,
    "guidance" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verdict" TEXT NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "WritingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WritingTemplate_authorId_createdAt_idx" ON "WritingTemplate"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "WritingTask_sessionId_createdAt_idx" ON "WritingTask"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WritingAttempt_taskId_studentId_key" ON "WritingAttempt"("taskId", "studentId");

-- AddForeignKey
ALTER TABLE "WritingTemplate" ADD CONSTRAINT "WritingTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingTask" ADD CONSTRAINT "WritingTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingAttempt" ADD CONSTRAINT "WritingAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WritingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingAttempt" ADD CONSTRAINT "WritingAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


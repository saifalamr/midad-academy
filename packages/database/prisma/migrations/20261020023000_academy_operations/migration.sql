-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "changeReason" TEXT,
ADD COLUMN     "makeupForId" TEXT;

-- CreateTable
CREATE TABLE "CourseApplication" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "kind" TEXT NOT NULL DEFAULT 'NEW',
    "preferredTime" TEXT NOT NULL DEFAULT '',
    "levelNotes" TEXT NOT NULL DEFAULT '',
    "needsAssessment" BOOLEAN NOT NULL DEFAULT false,
    "response" TEXT NOT NULL DEFAULT '',
    "quotedAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paymentReference" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyServiceRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "response" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyNotice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSkill" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillProgress" (
    "skillId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRACTICING',
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillProgress_pkey" PRIMARY KEY ("skillId","studentId")
);

-- CreateTable
CREATE TABLE "AcademyPolicy" (
    "id" TEXT NOT NULL DEFAULT 'academy',
    "content" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseApplication_parentId_createdAt_idx" ON "CourseApplication"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseApplication_status_createdAt_idx" ON "CourseApplication"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseApplication_courseId_studentId_key" ON "CourseApplication"("courseId", "studentId");

-- CreateIndex
CREATE INDEX "AcademyServiceRequest_studentId_createdAt_idx" ON "AcademyServiceRequest"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademyServiceRequest_status_kind_idx" ON "AcademyServiceRequest"("status", "kind");

-- CreateIndex
CREATE INDEX "AcademyNotice_userId_createdAt_idx" ON "AcademyNotice"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetId_createdAt_idx" ON "AuditEvent"("targetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSkill_courseId_title_key" ON "CourseSkill"("courseId", "title");

-- CreateIndex
CREATE INDEX "SkillProgress_studentId_idx" ON "SkillProgress"("studentId");

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_makeupForId_fkey" FOREIGN KEY ("makeupForId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseApplication" ADD CONSTRAINT "CourseApplication_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ParentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseApplication" ADD CONSTRAINT "CourseApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseApplication" ADD CONSTRAINT "CourseApplication_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyServiceRequest" ADD CONSTRAINT "AcademyServiceRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyServiceRequest" ADD CONSTRAINT "AcademyServiceRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyServiceRequest" ADD CONSTRAINT "AcademyServiceRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyNotice" ADD CONSTRAINT "AcademyNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSkill" ADD CONSTRAINT "CourseSkill_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillProgress" ADD CONSTRAINT "SkillProgress_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "CourseSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillProgress" ADD CONSTRAINT "SkillProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


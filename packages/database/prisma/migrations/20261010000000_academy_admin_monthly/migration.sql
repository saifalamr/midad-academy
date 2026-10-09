ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TABLE "User" ADD COLUMN "username" TEXT, ADD COLUMN "whatsappPhone" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "Course" ADD COLUMN "month" TEXT, ADD COLUMN "billingPeriod" TEXT NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "Course" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Europe/Istanbul';

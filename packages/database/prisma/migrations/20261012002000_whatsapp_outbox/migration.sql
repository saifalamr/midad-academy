ALTER TABLE "User" ADD COLUMN "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "WhatsAppNotification" (
 "id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL, "recipientUserId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "referenceId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lockedAt" TIMESTAMP(3), "acceptedAt" TIMESTAMP(3), "providerId" TEXT, "lastError" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "WhatsAppNotification_key_key" ON "WhatsAppNotification"("key");
CREATE INDEX "WhatsAppNotification_status_availableAt_idx" ON "WhatsAppNotification"("status", "availableAt");
ALTER TABLE "WhatsAppNotification" ADD CONSTRAINT "WhatsAppNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "SeatReservation" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "checkoutSessionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeatReservation_checkoutSessionId_key" ON "SeatReservation"("checkoutSessionId");
CREATE UNIQUE INDEX "SeatReservation_courseId_studentId_key" ON "SeatReservation"("courseId", "studentId");
CREATE INDEX "SeatReservation_courseId_idx" ON "SeatReservation"("courseId");
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

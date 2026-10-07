CREATE TABLE "ClassroomState" (
 "courseId" TEXT NOT NULL PRIMARY KEY,
 "sharedDoc" JSONB,
 "pdfPage" INTEGER NOT NULL DEFAULT 1,
 "revision" INTEGER NOT NULL DEFAULT 0,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ClassroomState_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "DrawingPermission" (
 "courseId" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 PRIMARY KEY ("courseId", "userId"),
 CONSTRAINT "DrawingPermission_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DrawingPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

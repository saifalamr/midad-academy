ALTER TABLE "ClassSession" ADD COLUMN "materialsVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "SessionMaterial" (
 "id" TEXT NOT NULL,
 "sessionId" TEXT NOT NULL,
 "contentId" TEXT NOT NULL,
 "order" INTEGER NOT NULL,
 "title" TEXT NOT NULL,
 "type" "ContentType" NOT NULL,
 "contentUrl" TEXT NOT NULL,
 "description" TEXT NOT NULL,
 CONSTRAINT "SessionMaterial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionMaterial_sessionId_contentId_key" ON "SessionMaterial"("sessionId", "contentId");
CREATE UNIQUE INDEX "SessionMaterial_sessionId_order_key" ON "SessionMaterial"("sessionId", "order");
CREATE INDEX "SessionMaterial_contentId_idx" ON "SessionMaterial"("contentId");
ALTER TABLE "SessionMaterial" ADD CONSTRAINT "SessionMaterial_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionMaterial" ADD CONSTRAINT "SessionMaterial_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CourseContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

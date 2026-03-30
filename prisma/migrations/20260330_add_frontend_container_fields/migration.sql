-- AlterTable — Add frontend container fields
ALTER TABLE "deployments" ADD COLUMN "frontendAppName" TEXT;
ALTER TABLE "deployments" ADD COLUMN "frontendAppUrl" TEXT;

-- CreateIndex (prevent duplicate frontend container app names)
CREATE UNIQUE INDEX "deployments_frontendAppName_key" ON "deployments"("frontendAppName") WHERE "frontendAppName" IS NOT NULL;

-- AlterTable
ALTER TABLE "deployments" ADD COLUMN "v5BuildId" TEXT;

-- CreateIndex (prevent duplicate container app names, domains, database names)
CREATE UNIQUE INDEX "deployments_containerAppName_key" ON "deployments"("containerAppName") WHERE "containerAppName" IS NOT NULL;
CREATE UNIQUE INDEX "deployments_customDomain_key" ON "deployments"("customDomain") WHERE "customDomain" IS NOT NULL;
CREATE UNIQUE INDEX "deployments_databaseName_databaseHost_key" ON "deployments"("databaseName", "databaseHost") WHERE "databaseName" IS NOT NULL AND "databaseHost" IS NOT NULL;

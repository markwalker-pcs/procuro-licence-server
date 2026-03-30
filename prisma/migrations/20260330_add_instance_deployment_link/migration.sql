-- AlterTable: Add optional deployment link to instances
ALTER TABLE "instances" ADD COLUMN "deploymentId" TEXT;

-- CreateIndex: Index on deploymentId for efficient lookups
CREATE INDEX "instances_deploymentId_idx" ON "instances"("deploymentId");

-- AddForeignKey: Link instances to deployments
ALTER TABLE "instances" ADD CONSTRAINT "instances_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

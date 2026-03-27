-- Add custom domain fields to deployments
ALTER TABLE "deployments" ADD COLUMN "customDomain" TEXT;
ALTER TABLE "deployments" ADD COLUMN "sslCertExpiry" TIMESTAMP(3);

-- Create tenant configuration key-value store
CREATE TABLE "tenant_configs" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "configValue" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_configs_pkey" PRIMARY KEY ("id")
);

-- Create indices
CREATE INDEX "tenant_configs_deploymentId_idx" ON "tenant_configs"("deploymentId");
CREATE INDEX "tenant_configs_category_idx" ON "tenant_configs"("category");
CREATE UNIQUE INDEX "tenant_configs_deploymentId_configKey_key" ON "tenant_configs"("deploymentId", "configKey");

-- Add foreign key
ALTER TABLE "tenant_configs" ADD CONSTRAINT "tenant_configs_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

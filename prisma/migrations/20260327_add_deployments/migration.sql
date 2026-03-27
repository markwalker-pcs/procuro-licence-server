-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "DatabaseType" AS ENUM ('POSTGRESQL', 'SQLSERVER', 'MYSQL', 'MARIADB');

-- CreateEnum
CREATE TYPE "ConnectivityType" AS ENUM ('PRIVATE_LINK', 'SITE_TO_SITE_VPN', 'EXPRESSROUTE', 'PUBLIC_ENDPOINT');

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deploymentLabel" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PROVISIONING',
    "containerAppName" TEXT,
    "containerAppUrl" TEXT,
    "imageTag" TEXT,
    "databaseType" "DatabaseType" NOT NULL DEFAULT 'POSTGRESQL',
    "databaseHost" TEXT,
    "databasePort" INTEGER,
    "databaseName" TEXT,
    "connectivityType" "ConnectivityType",
    "notes" TEXT,
    "provisionedBy" TEXT NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deployments_customerId_idx" ON "deployments"("customerId");

-- CreateIndex
CREATE INDEX "deployments_status_idx" ON "deployments"("status");

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

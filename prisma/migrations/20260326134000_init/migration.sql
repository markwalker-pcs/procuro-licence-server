-- Pro-curo Licence Server — Initial Migration
-- Creates all 7 tables from the Technical Architecture Document, Section 6

-- Enums
CREATE TYPE "DeploymentModel" AS ENUM ('SAAS', 'HYBRID', 'ON_PREMISES');
CREATE TYPE "LicenceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');
CREATE TYPE "CheckInStatus" AS ENUM ('VALID', 'WARNING', 'EXPIRED', 'INVALID');
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'ENGINEER', 'READ_ONLY');

-- Customers
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "deploymentModel" "DeploymentModel" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- Licences
CREATE TABLE "licences" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "licenceKey" TEXT NOT NULL,
    "licensedUsers" INTEGER NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "LicenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "licences_pkey" PRIMARY KEY ("id")
);

-- Instances
CREATE TABLE "instances" (
    "id" TEXT NOT NULL,
    "licenceId" TEXT NOT NULL,
    "instanceUuid" TEXT NOT NULL,
    "softwareVersion" TEXT,
    "lastCheckIn" TIMESTAMP(3),
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- Check-ins
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeUsers" INTEGER NOT NULL,
    "softwareVersion" TEXT NOT NULL,
    "responseStatus" "CheckInStatus" NOT NULL,
    "ipAddress" TEXT,
    "rawPayload" JSONB,
    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- Offline files
CREATE TABLE "offline_files" (
    "id" TEXT NOT NULL,
    "licenceId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    CONSTRAINT "offline_files_pkey" PRIMARY KEY ("id")
);

-- Audit log
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- Admin users
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "azureAdId" TEXT,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ENGINEER',
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "licences_licenceKey_key" ON "licences"("licenceKey");
CREATE UNIQUE INDEX "instances_instanceUuid_key" ON "instances"("instanceUuid");
CREATE UNIQUE INDEX "admin_users_azureAdId_key" ON "admin_users"("azureAdId");
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- Indexes
CREATE INDEX "licences_customerId_idx" ON "licences"("customerId");
CREATE INDEX "licences_status_idx" ON "licences"("status");
CREATE INDEX "instances_licenceId_idx" ON "instances"("licenceId");
CREATE INDEX "instances_lastCheckIn_idx" ON "instances"("lastCheckIn");
CREATE INDEX "check_ins_instanceId_idx" ON "check_ins"("instanceId");
CREATE INDEX "check_ins_timestamp_idx" ON "check_ins"("timestamp");
CREATE INDEX "offline_files_licenceId_idx" ON "offline_files"("licenceId");
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log"("timestamp");
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- Foreign keys
ALTER TABLE "licences" ADD CONSTRAINT "licences_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "instances" ADD CONSTRAINT "instances_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "licences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offline_files" ADD CONSTRAINT "offline_files_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "licences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

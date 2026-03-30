-- AlterTable: Add pre-generated instance UUID to deployments
-- This UUID is assigned during provisioning and matched on first V5 check-in
ALTER TABLE "deployments" ADD COLUMN "expectedInstanceUuid" TEXT;

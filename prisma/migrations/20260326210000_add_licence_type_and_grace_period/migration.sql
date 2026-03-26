-- Add licence type (PER_USER/CONCURRENT) and configurable grace period
-- Phase 4: Support for both per-user and concurrent licensing models

-- Step 1: Create the LicenceType enum
CREATE TYPE "LicenceType" AS ENUM ('PER_USER', 'CONCURRENT');

-- Step 2: Add licenceType and gracePeriodDays to licences table
ALTER TABLE "licences" ADD COLUMN "licenceType" "LicenceType" NOT NULL DEFAULT 'PER_USER';
ALTER TABLE "licences" ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 30;

-- Step 3: Add TYPE_CHANGE to AmendmentType enum
ALTER TYPE "AmendmentType" ADD VALUE 'TYPE_CHANGE';

-- Step 4: Add type-change tracking fields to licence_amendments
ALTER TABLE "licence_amendments" ADD COLUMN "previousType" "LicenceType";
ALTER TABLE "licence_amendments" ADD COLUMN "newType" "LicenceType";

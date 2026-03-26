-- Migration: Add invoice reference tracking to licences
-- Adds invoiceReference to licences table and creates licence_amendments table
-- for tracking user count changes, renewals, and their FreeAgent invoice references

-- Add invoice reference to existing licences table
ALTER TABLE "licences" ADD COLUMN "invoiceReference" TEXT;

-- Create amendment type enum
CREATE TYPE "AmendmentType" AS ENUM ('USER_INCREASE', 'USER_DECREASE', 'RENEWAL', 'EXPIRY_EXTENSION');

-- Create licence amendments table
CREATE TABLE "licence_amendments" (
    "id" TEXT NOT NULL,
    "licenceId" TEXT NOT NULL,
    "amendmentType" "AmendmentType" NOT NULL,
    "previousUsers" INTEGER NOT NULL,
    "newUsers" INTEGER NOT NULL,
    "invoiceReference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licence_amendments_pkey" PRIMARY KEY ("id")
);

-- Create index on licenceId for fast lookups
CREATE INDEX "licence_amendments_licenceId_idx" ON "licence_amendments"("licenceId");

-- Add foreign key constraint
ALTER TABLE "licence_amendments" ADD CONSTRAINT "licence_amendments_licenceId_fkey"
    FOREIGN KEY ("licenceId") REFERENCES "licences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

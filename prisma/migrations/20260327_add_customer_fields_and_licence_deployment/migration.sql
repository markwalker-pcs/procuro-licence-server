-- Add customer fields: customerNumber, contactPhone, primaryContact
-- Add deploymentModel to licences table (copied from customer at creation time)

-- Step 1: Add new customer fields
ALTER TABLE "customers" ADD COLUMN "customerNumber" TEXT;
ALTER TABLE "customers" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "customers" ADD COLUMN "primaryContact" TEXT;

-- Step 2: Backfill customer numbers for existing customers
-- Uses creation date and a row number sequence
WITH numbered AS (
  SELECT id, "createdAt",
    ROW_NUMBER() OVER (PARTITION BY DATE("createdAt") ORDER BY "createdAt") AS seq
  FROM "customers"
)
UPDATE "customers" c
SET "customerNumber" = 'PCSCN-' || TO_CHAR(n."createdAt", 'YYYYMMDD') || '-' || LPAD(n.seq::TEXT, 4, '0')
FROM numbered n
WHERE c.id = n.id;

-- Make customerNumber NOT NULL and UNIQUE after backfill
ALTER TABLE "customers" ALTER COLUMN "customerNumber" SET NOT NULL;
CREATE UNIQUE INDEX "customers_customerNumber_key" ON "customers"("customerNumber");

-- Step 3: Add deploymentModel to licences, copying from the customer
ALTER TABLE "licences" ADD COLUMN "deploymentModel" "DeploymentModel";

UPDATE "licences" l
SET "deploymentModel" = c."deploymentModel"
FROM "customers" c
WHERE l."customerId" = c.id;

ALTER TABLE "licences" ALTER COLUMN "deploymentModel" SET NOT NULL;

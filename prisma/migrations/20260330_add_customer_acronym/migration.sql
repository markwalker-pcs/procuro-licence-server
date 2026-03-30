-- Add customer acronym field for Azure resource naming
ALTER TABLE "customers" ADD COLUMN "customerAcronym" TEXT;

-- Create unique index (allows NULL for existing customers until backfilled)
CREATE UNIQUE INDEX "customers_customerAcronym_key" ON "customers"("customerAcronym") WHERE "customerAcronym" IS NOT NULL;

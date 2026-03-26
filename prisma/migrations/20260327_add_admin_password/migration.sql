-- Add password hash to admin users for production authentication
ALTER TABLE "admin_users" ADD COLUMN "passwordHash" TEXT;

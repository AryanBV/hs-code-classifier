-- Drop deprecated description_clean column
-- The Prisma schema only uses 'description' field, no need for duplicate
ALTER TABLE hs_codes DROP COLUMN IF EXISTS description_clean;

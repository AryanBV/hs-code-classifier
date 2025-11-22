-- Add GIN index for fast keyword searching on hs_codes table
-- Run this in Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_keywords_gin ON hs_codes USING GIN (keywords);

-- Verify the index was created
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE tablename = 'hs_codes';

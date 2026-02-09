-- =====================================================
-- Migration: Add Missing 6-Digit HS Codes
-- =====================================================
-- Problem: 3,413 intermediate 6-digit codes are missing
-- Impact: Users cannot see all valid classification options
-- Example: 0901.12 missing, only 0901.12.00 exists
-- =====================================================

-- Step 1: Show what will be created (DRY RUN)
-- Uncomment to preview without making changes
/*
SELECT DISTINCT
  SUBSTRING(h.code, 1, 7) as new_code,
  SPLIT_PART(h.description, ' : ', 1) ||
    CASE
      WHEN SPLIT_PART(h.description, ' : ', 2) != ''
      THEN ' : ' || SPLIT_PART(h.description, ' : ', 2)
      ELSE ''
    END as new_description,
  SUBSTRING(h.code, 1, 2) as chapter
FROM hs_codes h
WHERE LENGTH(h.code) = 10
  AND SUBSTRING(h.code, 1, 7) NOT IN (
    SELECT code FROM hs_codes WHERE LENGTH(code) = 7
  )
ORDER BY new_code
LIMIT 50;
*/

-- Step 2: Insert missing 6-digit codes
-- This creates intermediate codes from their 8-digit children
INSERT INTO hs_codes (
  code,
  description,
  chapter,
  heading,
  subheading,
  country_code,
  is_other,
  created_at,
  updated_at
)
SELECT DISTINCT
  SUBSTRING(h.code, 1, 7) as code,
  -- Build description from first two parts (before specific tariff details)
  SPLIT_PART(h.description, ' : ', 1) ||
    CASE
      WHEN SPLIT_PART(h.description, ' : ', 2) != ''
      THEN ' : ' || SPLIT_PART(h.description, ' : ', 2)
      ELSE ''
    END as description,
  SUBSTRING(h.code, 1, 2) as chapter,
  SUBSTRING(h.code, 1, 4) as heading,
  SUBSTRING(h.code, 1, 7) as subheading,
  'IN' as country_code,
  CASE
    WHEN h.description ILIKE '%other%' AND h.description NOT ILIKE '%other than%'
    THEN true
    ELSE false
  END as is_other,
  NOW() as created_at,
  NOW() as updated_at
FROM hs_codes h
WHERE LENGTH(h.code) = 10
  AND SUBSTRING(h.code, 1, 7) NOT IN (
    SELECT code FROM hs_codes WHERE LENGTH(code) = 7
  )
ON CONFLICT (code) DO NOTHING;

-- Step 3: Verify the fix for coffee (0901)
SELECT code, description, is_other
FROM hs_codes
WHERE code LIKE '0901.%' AND LENGTH(code) = 7
ORDER BY code;

-- Expected output should now include 0901.12:
-- 0901.11 | Coffee, not roasted : --Not decaffeinated
-- 0901.12 | Coffee, not roasted : --Decaffeinated     <-- NEW!
-- 0901.21 | Coffee roasted : --Not decaffeinated
-- 0901.22 | Coffee roasted : --Decaffeinated
-- 0901.90 | Other

-- Step 4: Count verification
SELECT
  'Before' as status,
  (SELECT COUNT(*) FROM hs_codes WHERE LENGTH(code) = 7) as six_digit_count
UNION ALL
SELECT
  'Expected After' as status,
  (SELECT COUNT(DISTINCT SUBSTRING(code, 1, 7)) FROM hs_codes WHERE LENGTH(code) = 10) as six_digit_count;

-- =====================================================
-- PART 2: Update hs_code_hierarchy table
-- =====================================================

-- Step 5: Insert missing 6-digit codes into hierarchy
INSERT INTO hs_code_hierarchy (
  code,
  parent_code,
  level,
  children_codes,
  all_children,
  created_at,
  updated_at
)
SELECT DISTINCT
  SUBSTRING(h.code, 1, 7) as code,
  SUBSTRING(h.code, 1, 4) as parent_code,
  6 as level,
  ARRAY(
    SELECT DISTINCT c.code
    FROM hs_codes c
    WHERE c.code LIKE SUBSTRING(h.code, 1, 7) || '%'
      AND c.code != SUBSTRING(h.code, 1, 7)
      AND LENGTH(c.code) = 10
    ORDER BY c.code
  ) as children_codes,
  ARRAY(
    SELECT DISTINCT c.code
    FROM hs_codes c
    WHERE c.code LIKE SUBSTRING(h.code, 1, 7) || '%'
      AND c.code != SUBSTRING(h.code, 1, 7)
    ORDER BY c.code
  ) as all_children,
  NOW() as created_at,
  NOW() as updated_at
FROM hs_codes h
WHERE LENGTH(h.code) = 10
  AND SUBSTRING(h.code, 1, 7) NOT IN (
    SELECT code FROM hs_code_hierarchy WHERE level = 6
  )
ON CONFLICT (code) DO UPDATE SET
  children_codes = EXCLUDED.children_codes,
  all_children = EXCLUDED.all_children,
  updated_at = NOW();

-- Step 6: Update parent (4-digit) entries to include new 6-digit children
UPDATE hs_code_hierarchy parent
SET
  children_codes = (
    SELECT ARRAY_AGG(DISTINCT child.code ORDER BY child.code)
    FROM hs_code_hierarchy child
    WHERE child.parent_code = parent.code
      AND child.level = 6
  ),
  updated_at = NOW()
WHERE parent.level = 4
  AND EXISTS (
    SELECT 1 FROM hs_code_hierarchy child
    WHERE child.parent_code = parent.code
      AND child.level = 6
  );

-- Step 7: Verify hierarchy for 0901
SELECT code, parent_code, level, children_codes
FROM hs_code_hierarchy
WHERE code = '0901' OR parent_code = '0901'
ORDER BY code;

-- Expected: 0901's children_codes should now include 0901.12

-- =====================================================
-- ROLLBACK (if needed)
-- =====================================================
/*
-- To undo this migration:
DELETE FROM hs_codes
WHERE LENGTH(code) = 7
  AND created_at > '2025-12-31'::timestamp;

DELETE FROM hs_code_hierarchy
WHERE level = 6
  AND created_at > '2025-12-31'::timestamp;
*/

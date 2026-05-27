-- Add 'separate_inorganic_compound' to chemical_class CHECK constraint
-- Required by O1 Ch.28 Note 1 extraction (per extraction-log.md 2026-05-26).
-- Approach: drop old constraint by name, recreate with expanded enum.

ALTER TABLE tariff_line_attributes
  DROP CONSTRAINT IF EXISTS tariff_line_attributes_chemical_class_check;

ALTER TABLE tariff_line_attributes
  ADD CONSTRAINT tariff_line_attributes_chemical_class_check
  CHECK (
    chemical_class IS NULL OR chemical_class IN (
      'separate_organic_compound',
      'separate_inorganic_compound',
      'isomer_mixture',
      'sugar_derivative',
      'diazonium_salt',
      'other'
    )
  );

-- Rollback:
-- ALTER TABLE tariff_line_attributes
--   DROP CONSTRAINT IF EXISTS tariff_line_attributes_chemical_class_check;
-- ALTER TABLE tariff_line_attributes
--   ADD CONSTRAINT tariff_line_attributes_chemical_class_check
--   CHECK (chemical_class IS NULL OR chemical_class IN
--   ('separate_organic_compound','isomer_mixture','sugar_derivative','diazonium_salt','other'));

-- Add GIN indexes on previously-unindexed array columns of tariff_line_attributes.
-- Per quality-review 2026-05-26: same query pattern as material/form/function_/intended_use,
-- excluded from initial migration without rationale. Both will see = ANY(arr) lookups in
-- Verifier Rule 7 (notes-conformance) batch evaluation across candidate codes.
CREATE INDEX idx_tla_processing_state ON tariff_line_attributes USING GIN(processing_state);
CREATE INDEX idx_tla_composition      ON tariff_line_attributes USING GIN(composition);

-- Rollback:
-- DROP INDEX IF EXISTS idx_tla_processing_state;
-- DROP INDEX IF EXISTS idx_tla_composition;

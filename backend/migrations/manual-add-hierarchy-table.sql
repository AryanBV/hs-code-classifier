-- Manual Migration: Add HS Code Hierarchy Table
-- Run this SQL when database is available
-- This migration adds the hierarchy table for parent-child relationships

-- Create the hs_code_hierarchy table
CREATE TABLE IF NOT EXISTS hs_code_hierarchy (
    code VARCHAR(20) PRIMARY KEY,
    parent_code VARCHAR(20),
    level INTEGER NOT NULL,
    children_codes TEXT[] NOT NULL DEFAULT '{}',
    all_children TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for fast hierarchy traversal
CREATE INDEX IF NOT EXISTS idx_parent_code ON hs_code_hierarchy(parent_code);
CREATE INDEX IF NOT EXISTS idx_hierarchy_level ON hs_code_hierarchy(level);

-- Add comments for documentation
COMMENT ON TABLE hs_code_hierarchy IS 'Stores parent-child relationships for HS codes to enable hierarchy expansion';
COMMENT ON COLUMN hs_code_hierarchy.code IS 'HS code (e.g., "8408", "8408.20", "8408.20.10")';
COMMENT ON COLUMN hs_code_hierarchy.parent_code IS 'Parent code (e.g., "8408.20" -> parent is "8408")';
COMMENT ON COLUMN hs_code_hierarchy.level IS 'Hierarchy level: 2=chapter, 4=heading, 6=subheading, 8/10=tariff';
COMMENT ON COLUMN hs_code_hierarchy.children_codes IS 'Array of direct child codes';
COMMENT ON COLUMN hs_code_hierarchy.all_children IS 'Array of ALL descendant codes (recursive)';

-- After running this migration, run: npx ts-node scripts/build-hierarchy-table.ts

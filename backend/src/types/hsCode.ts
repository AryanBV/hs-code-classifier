/**
 * HS Code Data Structure
 * Represents a complete harmonized system product classification
 */

/**
 * Notes object that can contain various types of notes from PDFs
 * Dynamic structure to capture any note types found in PDFs
 */
export interface HSCodeNotes {
  // Structured note types (commonly found)
  section_main_notes?: string;
  chapter_notes?: string;
  subheading_notes?: string;
  heading_notes?: string;
  policy_conditions?: Array<{
    condition_id: string;
    description: string;
  }>;
  export_licensing_notes?: string;
  export_policy_details?: string;
  supplementary_notes?: string;

  // Dynamic notes - any other note types found in PDFs
  // This allows us to capture notes we may not have anticipated
  [key: string]: any;
}

/**
 * Main HS Code interface
 * Contains all information about a product classification
 */
export interface HSCode {
  // Core identification
  hs_code: string;
  description: string;

  // Hierarchical structure
  chapter: string;
  heading: string;
  subheading: string;

  // Trade information
  basic_duty: string;
  export_policy?: 'Free' | 'Restricted' | 'Prohibited' | string;

  // Extended information from PDFs
  notes?: HSCodeNotes;

  // Optional metadata
  last_updated?: string;
  source?: string;
}

/**
 * Bulk HS Code data (array of codes)
 */
export type HSCodeDatabase = HSCode[];

'use client'

import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Selection } from '@/lib/hooks/use-wizard'

// ============================================================================
// Types
// ============================================================================

interface BreadcrumbTrailProps {
  selections: Selection[]
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Short label mappings for common classification answers
 * Makes breadcrumbs more readable without clutter
 */
const SHORT_LABELS: Record<string, string> = {
  'Regular (not decaffeinated)': 'Not decaf',
  'Decaffeinated': 'Decaf',
  'Not roasted (green/raw)': 'Not roasted',
  'Roasted': 'Roasted',
  'Arabica': 'Arabica',
  'Robusta': 'Robusta',
  'Whole beans': 'Beans',
  'Ground': 'Ground',
  'Instant/Soluble': 'Instant',
  'Plantation A': 'Grade A',
  'Plantation B': 'Grade B',
  'Plantation C': 'Grade C',
  'Cherry/Parchment': 'Cherry',
  'Washed (wet processed)': 'Washed',
  'Natural (dry processed)': 'Natural',
  'Other processing': 'Other',
}

/**
 * Get a short, readable label for breadcrumb display
 * Prioritizes meaningful short labels over truncated gibberish
 */
function getShortLabel(label: string): string {
  // Check if we have a predefined short label
  if (SHORT_LABELS[label]) {
    return SHORT_LABELS[label]
  }

  // Smart truncation: try to keep meaningful words
  if (label.length <= 15) {
    return label
  }

  // If label has parentheses, try to use content before them
  const parenIndex = label.indexOf('(')
  if (parenIndex > 0 && parenIndex <= 15) {
    return label.substring(0, parenIndex).trim()
  }

  // Otherwise truncate with ellipsis
  return label.substring(0, 12).trim() + '...'
}

// ============================================================================
// Component
// ============================================================================

/**
 * BreadcrumbTrail - Shows classification path as readable labels
 * Clean, user-friendly display: Not decaf > Grade A > ...
 */
export function BreadcrumbTrail({ selections }: BreadcrumbTrailProps) {
  if (selections.length === 0) return null

  return (
    <motion.div
      className="flex items-center gap-1 text-sm overflow-x-auto pb-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {selections.map((selection, index) => (
        <div key={index} className="flex items-center gap-1 flex-shrink-0">
          {index > 0 && (
            <ChevronRight className="w-3 h-3 text-slate-400" />
          )}
          <span
            className="text-slate-600 dark:text-slate-400"
            title={selection.answerLabel}
          >
            {getShortLabel(selection.answerLabel)}
          </span>
        </div>
      ))}
      <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
      <span className="text-slate-400 dark:text-slate-500">...</span>
    </motion.div>
  )
}

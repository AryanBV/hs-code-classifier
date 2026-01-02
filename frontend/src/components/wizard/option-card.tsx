'use client'

import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

// ============================================================================
// Types
// ============================================================================

interface OptionCardProps {
  label: string
  code?: string
  index: number
  onClick: () => void
  isSelected?: boolean
  disabled?: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * OptionCard - Clean, professional option selection card
 * Minimalist design with subtle hover effects
 */
export function OptionCard({
  label,
  code,
  index,
  onClick,
  isSelected = false,
  disabled = false,
}: OptionCardProps) {
  // Parse label into primary and secondary parts
  const { primary, secondary } = parseLabel(label)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
      whileTap={{ scale: 0.995 }}
      tabIndex={0}
      role="option"
      aria-selected={isSelected}
      className={cn(
        // Base styles - clean and minimal
        'w-full p-4 text-left rounded-xl border transition-all duration-200',
        'group focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2',
        'focus:ring-offset-white dark:focus:ring-offset-slate-900',

        // Light mode
        'bg-white border-slate-200',
        'hover:border-cyan-400 hover:bg-slate-50',

        // Dark mode
        'dark:bg-slate-800/50 dark:border-slate-700',
        'dark:hover:border-cyan-500 dark:hover:bg-slate-800',

        // Selected state
        isSelected && [
          'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20',
          'dark:border-cyan-400',
        ],

        // Disabled state
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Primary label */}
          <p
            className={cn(
              'font-medium text-slate-900 dark:text-white transition-colors',
              'group-hover:text-cyan-600 dark:group-hover:text-cyan-400',
              !secondary ? 'line-clamp-2' : 'line-clamp-1'
            )}
          >
            {primary}
          </p>

          {/* Secondary text */}
          {secondary && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {secondary}
            </p>
          )}
        </div>

        {/* Code and chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {code && (
            <span className="text-sm font-mono text-cyan-600 dark:text-cyan-400">
              {formatCode(code)}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-500 transition-colors" />
        </div>
      </div>
    </motion.button>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse label into primary and secondary parts
 * Handles formats like:
 * - "Coffee, not roasted - Not decaffeinated" -> primary: "Coffee, not roasted", secondary: "Not decaffeinated"
 */
function parseLabel(label: string): { primary: string; secondary: string | null } {
  // Check for " - " separator (common in our labels)
  const dashIndex = label.indexOf(' - ')

  if (dashIndex > 0 && dashIndex < label.length - 3) {
    const primary = label.substring(0, dashIndex).trim()
    const secondary = label.substring(dashIndex + 3).trim()

    // Only split if both parts are meaningful
    if (primary.length > 5 && secondary.length > 2) {
      return { primary, secondary }
    }
  }

  // No split - return as single primary
  return { primary: label, secondary: null }
}

/**
 * Format HS code for display
 */
function formatCode(code: string): string {
  return code.replace(/\.00$/, '')
}

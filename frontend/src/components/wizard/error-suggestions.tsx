'use client'

import { motion } from 'framer-motion'
import { Lightbulb, ChevronRight } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface ErrorSuggestionsProps {
  suggestions: string[]
}

// ============================================================================
// Component
// ============================================================================

export function ErrorSuggestions({ suggestions }: ErrorSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null

  return (
    <motion.div
      className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          initial={{ rotate: -20, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 300 }}
        >
          <Lightbulb className="w-4 h-4 text-amber-500" />
        </motion.div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Try these:
        </span>
      </div>

      {/* Suggestions list */}
      <ul className="space-y-2">
        {suggestions.map((suggestion, index) => (
          <motion.li
            key={index}
            className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + index * 0.1, duration: 0.2 }}
          >
            <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
            <span>{suggestion}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}

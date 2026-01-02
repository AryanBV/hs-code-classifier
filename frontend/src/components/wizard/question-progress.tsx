'use client'

import { motion } from 'framer-motion'

// ============================================================================
// Types
// ============================================================================

interface QuestionProgressProps {
  current: number
  estimated: number
}

// ============================================================================
// Constants
// ============================================================================

// Professional progress messages
const PROGRESS_MESSAGES = [
  'Starting classification...',
  'Narrowing down options...',
  'Getting more specific...',
  'Almost there...',
  'Final step...'
]

// ============================================================================
// Component
// ============================================================================

/**
 * QuestionProgress - Progress bar with dynamic messages
 * Shows both visual progress and contextual status messages
 */
export function QuestionProgress({ current, estimated }: QuestionProgressProps) {
  const progress = (current / Math.max(estimated, current)) * 100
  const message = PROGRESS_MESSAGES[Math.min(current - 1, PROGRESS_MESSAGES.length - 1)]

  return (
    <motion.div
      className="space-y-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Progress bar - thin and subtle */}
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-cyan-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 95)}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Progress text */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{message}</span>
        <span>Question {current}</span>
      </div>
    </motion.div>
  )
}

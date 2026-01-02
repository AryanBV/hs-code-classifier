'use client'

import { motion } from 'framer-motion'

// ============================================================================
// Types
// ============================================================================

interface QuestionHeaderProps {
  questionNumber: number
}

// ============================================================================
// Constants
// ============================================================================

// Dynamic question titles - professional tone
const QUESTION_TITLES = [
  'What type of product is this?',
  'Select the subcategory',
  'Narrow down further',
  'Choose the specific type',
  'Final classification'
]

// ============================================================================
// Component
// ============================================================================

/**
 * QuestionHeader - Dynamic question titles based on question number
 * Provides context-appropriate headings instead of repetitive text
 */
export function QuestionHeader({ questionNumber }: QuestionHeaderProps) {
  const title = QUESTION_TITLES[Math.min(questionNumber - 1, QUESTION_TITLES.length - 1)]

  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      key={questionNumber}
    >
      <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
    </motion.div>
  )
}

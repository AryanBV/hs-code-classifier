'use client'

import { motion } from 'framer-motion'

// ============================================================================
// Types
// ============================================================================

interface ProgressBarProps {
  current: number
  total: number
}

// ============================================================================
// Component
// ============================================================================

export function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = Math.round((current / total) * 100)

  return (
    <div className="h-1 w-full bg-slate-200 dark:bg-slate-700">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
        style={{
          boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
        }}
      />
    </div>
  )
}

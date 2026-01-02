'use client'

import { motion } from 'framer-motion'

// ============================================================================
// Types
// ============================================================================

interface LoadingProgressProps {
  currentStep: number
  totalSteps: number
}

// ============================================================================
// Component
// ============================================================================

export function LoadingProgress({ currentStep, totalSteps }: LoadingProgressProps) {
  // Calculate progress: complete steps + half of current step
  const progress = ((currentStep - 1) / totalSteps) * 100 + (100 / totalSteps) * 0.5

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 95)}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  )
}

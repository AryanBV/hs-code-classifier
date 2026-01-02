'use client'

import { motion } from 'framer-motion'
import { Check, Loader2, Circle } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface Step {
  id: number
  label: string
  status: 'completed' | 'active' | 'pending'
}

interface LoadingStepsProps {
  currentStep: number
}

// ============================================================================
// Constants
// ============================================================================

const STEPS: Omit<Step, 'status'>[] = [
  { id: 1, label: 'Product analyzed' },
  { id: 2, label: 'Relevant chapters identified' },
  { id: 3, label: 'Navigating classification tree' },
  { id: 4, label: 'Finalizing HS code' }
]

// ============================================================================
// Component
// ============================================================================

export function LoadingSteps({ currentStep }: LoadingStepsProps) {
  const getStatus = (stepId: number): Step['status'] => {
    if (stepId < currentStep) return 'completed'
    if (stepId === currentStep) return 'active'
    return 'pending'
  }

  return (
    <div className="space-y-3">
      {STEPS.map((step, index) => {
        const status = getStatus(step.id)

        return (
          <motion.div
            key={step.id}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
          >
            {/* Icon */}
            <div className="flex-shrink-0">
              {status === 'completed' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
                >
                  <Check className="w-4 h-4 text-white" />
                </motion.div>
              )}
              {status === 'active' && (
                <div className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
              )}
              {status === 'pending' && (
                <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center">
                  <Circle className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                </div>
              )}
            </div>

            {/* Label */}
            <span className={`text-sm ${
              status === 'completed'
                ? 'text-emerald-600 dark:text-emerald-400'
                : status === 'active'
                  ? 'text-cyan-600 dark:text-cyan-400 font-medium'
                  : 'text-slate-400 dark:text-slate-500'
            }`}>
              {status === 'active' && '→ '}
              {step.label}
              {status === 'active' && '...'}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}

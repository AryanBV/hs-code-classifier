'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LoadingIcon } from './loading-icon'
import { LoadingProgress } from './loading-progress'
import { LoadingSteps } from './loading-steps'
import { LoadingFacts } from './loading-facts'

// ============================================================================
// Types
// ============================================================================

interface LoadingScreenProps {
  product?: string
}

// ============================================================================
// Constants
// ============================================================================

const TOTAL_STEPS = 4

const STEP_TITLES = [
  'Analyzing Your Product',
  'Finding Relevant Chapters',
  'Navigating Classification Tree',
  'Finalizing HS Code'
]

// Step timings (milliseconds)
const STEP_TIMINGS = [
  1500,  // Step 1 → 2: 1.5s
  2500,  // Step 2 → 3: 2.5s
  3000,  // Step 3 → 4: 3s
]

// ============================================================================
// Component
// ============================================================================

export function LoadingScreen({ product }: LoadingScreenProps) {
  const [currentStep, setCurrentStep] = useState(1)

  // Simulate step progression
  // In production, this could be driven by actual API progress events
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const progressToNextStep = (step: number) => {
      if (step < TOTAL_STEPS) {
        const delay = STEP_TIMINGS[step - 1] || 2000
        timeoutId = setTimeout(() => {
          setCurrentStep(step + 1)
          progressToNextStep(step + 1)
        }, delay)
      }
    }

    progressToNextStep(1)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        {/* Animated Icon */}
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <LoadingIcon currentStep={currentStep} />
        </motion.div>

        {/* Title */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {STEP_TITLES[currentStep - 1]}
          </h2>

          {product && (
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs mx-auto">
              &ldquo;{product}&rdquo;
            </p>
          )}
        </motion.div>

        {/* Progress Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <LoadingProgress currentStep={currentStep} totalSteps={TOTAL_STEPS} />
        </motion.div>

        {/* Steps Checklist */}
        <motion.div
          className="bg-white dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <LoadingSteps currentStep={currentStep} />
        </motion.div>

        {/* Fun Facts */}
        <LoadingFacts />
      </div>
    </div>
  )
}

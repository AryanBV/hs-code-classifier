'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'

// ============================================================================
// Types
// ============================================================================

interface RateLimitCountdownProps {
  seconds: number
  onComplete: () => void
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(secs: number): string {
  const mins = Math.floor(secs / 60)
  const s = secs % 60
  return `${mins}:${s.toString().padStart(2, '0')}`
}

// ============================================================================
// Component
// ============================================================================

export function RateLimitCountdown({ seconds, onComplete }: RateLimitCountdownProps) {
  const [remaining, setRemaining] = useState(seconds)
  const [isComplete, setIsComplete] = useState(false)

  const handleComplete = useCallback(() => {
    if (!isComplete) {
      setIsComplete(true)
      onComplete()
    }
  }, [isComplete, onComplete])

  useEffect(() => {
    if (remaining <= 0) {
      handleComplete()
      return
    }

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // Use setTimeout to avoid calling handleComplete during render
          setTimeout(handleComplete, 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [remaining, handleComplete])

  const progress = ((seconds - remaining) / seconds) * 100

  return (
    <motion.div
      className="text-center space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      {/* Label */}
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Available again in:
      </p>

      {/* Countdown timer */}
      <motion.p
        className="text-4xl font-mono font-bold text-purple-600 dark:text-purple-400"
        key={remaining}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.15 }}
      >
        {formatTime(remaining)}
      </motion.p>

      {/* Progress bar */}
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden max-w-xs mx-auto">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'linear' }}
        />
      </div>

      {/* Pulse animation when almost done */}
      {remaining <= 5 && remaining > 0 && (
        <motion.p
          className="text-xs text-purple-500 dark:text-purple-400"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          Almost ready...
        </motion.p>
      )}
    </motion.div>
  )
}

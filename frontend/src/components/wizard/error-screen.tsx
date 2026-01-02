'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, ArrowLeft, Edit3 } from 'lucide-react'
import { ErrorIcon } from './error-icon'
import { ErrorSuggestions } from './error-suggestions'
import { RateLimitCountdown } from './rate-limit-countdown'
import { cn } from '@/lib/cn'
import type { ClassificationError } from '@/lib/types/errors'

// ============================================================================
// Types
// ============================================================================

interface ErrorScreenProps {
  error: ClassificationError
  onRetry: () => void
  onStartOver: () => void
  onEditInput?: () => void
}

// ============================================================================
// Component
// ============================================================================

export function ErrorScreen({
  error,
  onRetry,
  onStartOver,
  onEditInput
}: ErrorScreenProps) {
  const [canRetry, setCanRetry] = useState(error.type !== 'rate_limit')

  const handleCountdownComplete = useCallback(() => {
    setCanRetry(true)
  }, [])

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Error Icon */}
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ErrorIcon type={error.type} />
        </motion.div>

        {/* Error Message */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {error.message}
          </h2>

          {error.details && (
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              {error.details}
            </p>
          )}
        </motion.div>

        {/* Original Input (for classification errors) */}
        {error.type === 'classification' && error.originalInput && (
          <motion.div
            className="bg-slate-100 dark:bg-slate-800 rounded-lg px-4 py-3 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-slate-500 dark:text-slate-400">Your input: </span>
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              &ldquo;{error.originalInput}&rdquo;
            </span>
          </motion.div>
        )}

        {/* Rate Limit Countdown */}
        {error.type === 'rate_limit' && error.retryAfter && (
          <RateLimitCountdown
            seconds={error.retryAfter}
            onComplete={handleCountdownComplete}
          />
        )}

        {/* Suggestions */}
        {error.suggestions && error.suggestions.length > 0 && (
          <ErrorSuggestions suggestions={error.suggestions} />
        )}

        {/* Example (for classification errors) */}
        {error.type === 'classification' && (
          <motion.div
            className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-4 border border-cyan-200 dark:border-cyan-800 text-left"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <p className="text-sm text-cyan-700 dark:text-cyan-300 mb-2 font-medium">
              Example:
            </p>
            <p className="text-sm text-cyan-600 dark:text-cyan-400">
              Instead of complex terms, try something like:{' '}
              <span className="font-medium">&ldquo;cotton t-shirt for men&rdquo;</span> or{' '}
              <span className="font-medium">&ldquo;stainless steel kitchen knife&rdquo;</span>
            </p>
          </motion.div>
        )}

        {/* Action Buttons */}
        <motion.div
          className="space-y-3 pt-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {/* Primary Action: Edit (for classification) or Retry (for others) */}
          {error.type === 'classification' && onEditInput ? (
            <button
              onClick={onEditInput}
              className={cn(
                'w-full py-3 px-4 rounded-xl font-medium',
                'bg-gradient-to-r from-cyan-500 to-blue-600 text-white',
                'shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/30',
                'hover:shadow-xl hover:from-cyan-400 hover:to-blue-500',
                'active:scale-[0.98]',
                'flex items-center justify-center gap-2 transition-all duration-200'
              )}
            >
              <Edit3 className="w-5 h-5" />
              Edit Description
            </button>
          ) : (
            <button
              onClick={onRetry}
              disabled={!canRetry}
              className={cn(
                'w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200',
                canRetry
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/30 hover:shadow-xl hover:from-cyan-400 hover:to-blue-500 active:scale-[0.98]'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              )}
            >
              <RotateCcw className={cn('w-5 h-5', !canRetry && 'animate-spin')} />
              {canRetry ? 'Try Again' : 'Please wait...'}
            </button>
          )}

          {/* Secondary Action: Start Over */}
          <button
            onClick={onStartOver}
            className={cn(
              'w-full py-3 px-4 rounded-xl font-medium',
              'border border-slate-200 dark:border-slate-700',
              'text-slate-700 dark:text-slate-200',
              'bg-white dark:bg-slate-800',
              'hover:bg-slate-50 dark:hover:bg-slate-700',
              'active:scale-[0.98]',
              'flex items-center justify-center gap-2 transition-all duration-200'
            )}
          >
            <ArrowLeft className="w-5 h-5" />
            Start Over
          </button>
        </motion.div>

        {/* Technical Details (collapsible, for development) */}
        {process.env.NODE_ENV === 'development' && (
          <motion.details
            className="text-left mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-500">
              Technical details
            </summary>
            <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs overflow-auto max-h-40 text-slate-600 dark:text-slate-400">
              {JSON.stringify(error, null, 2)}
            </pre>
          </motion.details>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Legacy Support - Accept string error for backwards compatibility
// ============================================================================

interface LegacyErrorScreenProps {
  message: string
  onRetry: () => void
  onStartOver: () => void
}

// Export a wrapper that accepts the old interface
export function LegacyErrorScreen({ message, onRetry, onStartOver }: LegacyErrorScreenProps) {
  // Convert string error to ClassificationError
  const error: ClassificationError = {
    type: 'unknown',
    message: 'Something went wrong',
    details: message,
    retryable: true
  }

  return (
    <ErrorScreen
      error={error}
      onRetry={onRetry}
      onStartOver={onStartOver}
    />
  )
}

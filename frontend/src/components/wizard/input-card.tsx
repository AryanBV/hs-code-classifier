'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { Search, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

// ============================================================================
// Types
// ============================================================================

interface InputCardProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading?: boolean
  error?: string | null
}

// ============================================================================
// Constants
// ============================================================================

const MIN_CHARS = 3
const MAX_CHARS = 500
const RECOMMENDED_MIN_CHARS = 10

// ============================================================================
// Component
// ============================================================================

export function InputCard({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  error = null,
}: InputCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 400)
    return () => clearTimeout(timer)
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [value])

  // Handle submit on Enter (without Shift)
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isValid && !isLoading) {
        onSubmit()
      }
    }
  }

  const isValid = value.trim().length >= MIN_CHARS && value.length <= MAX_CHARS
  const needsMoreChars = value.length > 0 && value.length < RECOMMENDED_MIN_CHARS

  return (
    <motion.div
      className={cn(
        'relative rounded-2xl border-2 transition-all duration-300',
        'bg-white dark:bg-slate-800/60 backdrop-blur-xl',
        isFocused
          ? 'border-cyan-500 dark:border-cyan-400 shadow-lg shadow-cyan-500/20 dark:shadow-cyan-400/20'
          : 'border-slate-200 dark:border-slate-700',
        error && 'border-red-500 dark:border-red-400'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      {/* Input Area */}
      <div className="p-5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Describe your product
        </label>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., LED light bulbs 60W for household use"
          className={cn(
            'w-full bg-transparent resize-none focus:outline-none',
            'text-base md:text-lg leading-relaxed',
            'text-slate-900 dark:text-white',
            'placeholder-slate-400 dark:placeholder-slate-500',
            'min-h-[70px]'
          )}
          rows={2}
          disabled={isLoading}
        />

        {/* Helper Text */}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
          Be specific: Include material, purpose, size, and any specifications
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Character count hint */}
      {needsMoreChars && (
        <div className="px-5 pb-2">
          <p className="text-xs text-amber-500 dark:text-amber-400">
            Add more details for better accuracy ({RECOMMENDED_MIN_CHARS - value.length} more characters recommended)
          </p>
        </div>
      )}

      {/* Submit Button */}
      <div className="p-5 pt-0">
        <motion.button
          onClick={onSubmit}
          disabled={!isValid || isLoading}
          className={cn(
            'w-full py-4 px-6 rounded-xl font-medium text-base',
            'flex items-center justify-center gap-2.5',
            'transition-all duration-300',
            isValid && !isLoading
              ? cn(
                  'bg-gradient-to-r from-cyan-500 to-blue-600 text-white',
                  'shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/30',
                  'hover:shadow-xl hover:shadow-cyan-500/30 dark:hover:shadow-cyan-500/40',
                  'hover:from-cyan-400 hover:to-blue-500',
                  'active:scale-[0.98]'
                )
              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          )}
          whileTap={isValid && !isLoading ? { scale: 0.98 } : {}}
        >
          {isLoading ? (
            <>
              <motion.div
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <span>Classifying...</span>
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              <span>Classify Product</span>
            </>
          )}
        </motion.button>

        {/* Enter hint */}
        {isValid && !isLoading && (
          <p className="text-xs text-center text-slate-400 dark:text-slate-500 mt-2">
            Press Enter to submit
          </p>
        )}
      </div>
    </motion.div>
  )
}

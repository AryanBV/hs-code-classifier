'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check } from 'lucide-react'

interface HsCodeDisplayProps {
  code: string
  description: string
  confidence: number
  onCopy?: () => void
}

export function HsCodeDisplay({
  code,
  description,
  confidence,
  onCopy,
}: HsCodeDisplayProps) {
  const [copied, setCopied] = useState(false)

  // Clean description - improved regex to handle formatting artifacts
  const cleanDescription = description
    .replace(/^[-:\s]+/, '')                    // Remove leading dashes/colons/spaces
    .replace(/:\s*-\s*-?\s*/g, ' - ')           // Fix ": - -" and ": -" patterns
    .replace(/\s+-\s+-\s+/g, ' - ')             // Fix " - - " patterns
    .replace(/-\s+emitting/gi, '-emitting')     // Fix "- emitting" → "-emitting"
    .replace(/\s*-\s*-\s*/g, ' - ')             // Fix remaining double dashes
    .replace(/\s+/g, ' ')                       // Normalize whitespace
    .trim()

  // Confidence color
  const getConfidenceColor = () => {
    if (confidence >= 85) return 'text-emerald-500'
    if (confidence >= 70) return 'text-amber-500'
    return 'text-red-500'
  }

  const getConfidenceLabel = () => {
    if (confidence >= 85) return 'High Confidence'
    if (confidence >= 70) return 'Medium Confidence'
    return 'Low Confidence'
  }

  const getConfidenceGradient = () => {
    if (confidence >= 85) return 'bg-gradient-to-r from-emerald-500 to-emerald-400'
    if (confidence >= 70) return 'bg-gradient-to-r from-amber-500 to-amber-400'
    return 'bg-gradient-to-r from-red-500 to-red-400'
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      onCopy?.()

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }

      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <motion.div
      className="bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.3, duration: 0.4, type: 'spring' }}
    >
      {/* HS Code */}
      <div className="text-center mb-4">
        <motion.div
          className="text-2xl sm:text-3xl md:text-4xl font-mono font-bold text-slate-900 dark:text-white tracking-wide whitespace-nowrap"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          {code}</motion.div>

        {/* Gradient underline */}
        <motion.div
          className="h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-500 rounded-full mx-auto mt-3"
          initial={{ width: 0 }}
          animate={{ width: '70%' }}
          transition={{ delay: 0.7, duration: 0.5 }}
        />
      </div>

      {/* Description */}
      <motion.p
        className="text-center text-slate-600 dark:text-slate-300 mb-6 text-sm sm:text-base"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.3 }}
      >
        {cleanDescription}
      </motion.p>

      {/* Confidence Bar */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.3 }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">Classification Confidence</span>
          <span className={`text-sm font-semibold ${getConfidenceColor()}`}>
            {confidence}%
          </span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${getConfidenceGradient()}`}
            initial={{ width: 0 }}
            animate={{ width: `${confidence}%` }}
            transition={{ delay: 0.9, duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <p className={`text-xs mt-1 ${getConfidenceColor()}`}>
          {getConfidenceLabel()}
        </p>
      </motion.div>

      {/* Copy Button - Full Width */}
      <motion.button
        onClick={handleCopy}
        className={`
          w-full py-3 px-4 rounded-xl font-medium text-sm
          flex items-center justify-center gap-2
          transition-all duration-200
          ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-cyan-500 hover:bg-cyan-400 text-white'
          }
        `}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.3 }}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied to Clipboard!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy HS Code
          </>
        )}
      </motion.button>
    </motion.div>
  )
}

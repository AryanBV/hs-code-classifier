'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, RefreshCw, ArrowRight } from 'lucide-react'

interface AlternativeCode {
  code: string
  description: string
  confidence?: number
  similarity?: number  // Alias for confidence (backwards compatibility)
  reason?: string
}

interface AlternativeCodesProps {
  alternatives: AlternativeCode[]
  onSelectAlternative?: (code: string) => void
}

export function AlternativeCodes({
  alternatives,
  onSelectAlternative,
}: AlternativeCodesProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!alternatives || alternatives.length === 0) return null

  return (
    <motion.div
      className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.3 }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <RefreshCw className="w-4 h-4 text-amber-500" />
          <span className="font-medium">Alternative Codes to Consider</span>
          <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
            {alternatives.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-2 bg-white dark:bg-slate-900">
              {alternatives.map((alt, index) => (
                <motion.div
                  key={alt.code}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                >
                  {/* Main row with code, description, and similarity */}
                  <div className="flex items-center gap-3">
                    {/* Code */}
                    <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400 w-24 flex-shrink-0">
                      {alt.code}
                    </span>

                    {/* Description */}
                    <span className="flex-1 text-sm text-slate-600 dark:text-slate-400 truncate">
                      {alt.description}
                    </span>

                    {/* Confidence/Similarity badge */}
                    {(alt.confidence || alt.similarity) && (
                      <span
                        className={`
                          text-xs font-medium px-2 py-1 rounded-full flex-shrink-0
                          ${
                            (alt.confidence || alt.similarity || 0) >= 80
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                              : (alt.confidence || alt.similarity || 0) >= 60
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }
                        `}
                      >
                        {alt.confidence || alt.similarity}% match
                      </span>
                    )}

                    {/* Action */}
                    {onSelectAlternative && (
                      <button
                        onClick={() => onSelectAlternative(alt.code)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 rounded"
                        title="Use this code instead"
                      >
                        <ArrowRight className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      </button>
                    )}
                  </div>

                  {/* Reason row - displayed if reason exists */}
                  {alt.reason && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 ml-4 flex items-center gap-1">
                      <span className="text-slate-400 dark:text-slate-500">↳</span>
                      {alt.reason}
                    </p>
                  )}
                </motion.div>
              ))}

              {/* Disclaimer */}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 px-1">
                These alternatives share similar characteristics. Verify with
                official sources before use.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

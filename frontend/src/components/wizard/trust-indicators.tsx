'use client'

import { motion } from 'framer-motion'

// ============================================================================
// Constants
// ============================================================================

// Exact count of 8-digit tariff items from database
const HS_CODE_COUNT = 12475

// ============================================================================
// Component
// ============================================================================

interface TrustIndicatorsProps {
  hsCodeCount?: number
}

export function TrustIndicators({ hsCodeCount = HS_CODE_COUNT }: TrustIndicatorsProps) {
  // Format number with Indian locale (commas)
  const formatNumber = (num: number) => num.toLocaleString('en-IN')

  return (
    <motion.div
      className="border-t border-slate-200 dark:border-slate-700 pt-6 mt-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.3 }}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-4">
        Trusted by Indian Exporters
      </p>

      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-cyan-600 dark:text-cyan-400">95%</span> Accuracy
        </span>

        <span className="text-slate-300 dark:text-slate-600">•</span>

        <span className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-cyan-600 dark:text-cyan-400">~30 sec</span> Average
        </span>

        <span className="text-slate-300 dark:text-slate-600">•</span>

        <span className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-cyan-600 dark:text-cyan-400">{formatNumber(hsCodeCount)}</span> HS Codes
        </span>
      </div>
    </motion.div>
  )
}

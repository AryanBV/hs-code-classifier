'use client'

import { motion } from 'framer-motion'

// ============================================================================
// Types
// ============================================================================

interface ProductContextProps {
  product: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * ProductContext - Shows the product being classified
 * Clean, professional banner that reminds users what they're classifying
 */
export function ProductContext({ product }: ProductContextProps) {
  // Truncate long product names
  const displayProduct = product.length > 60
    ? product.substring(0, 57) + '...'
    : product

  return (
    <motion.div
      className="bg-slate-50 dark:bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-200 dark:border-slate-700"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Classifying: <span className="text-slate-900 dark:text-white font-medium">&quot;{displayProduct}&quot;</span>
      </p>
    </motion.div>
  )
}

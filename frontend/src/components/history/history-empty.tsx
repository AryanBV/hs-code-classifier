'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { History, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface HistoryEmptyProps {
  compact?: boolean
}

export function HistoryEmpty({ compact = false }: HistoryEmptyProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center px-4 text-center py-6">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <History className="w-5 h-5 text-muted-foreground" />
        </div>
        <h3 className="text-xs font-medium text-muted-foreground mb-1">
          No history yet
        </h3>
        <p className="text-[10px] text-muted-foreground/70">
          Classifications will appear here
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center text-center py-16 px-4"
    >
      {/* Animated Icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mb-6"
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-500/20 dark:to-blue-500/20 flex items-center justify-center">
          <History className="w-12 h-12 text-cyan-500 dark:text-cyan-400" />
        </div>
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center"
        >
          <Sparkles className="w-4 h-4 text-cyan-500" />
        </motion.div>
      </motion.div>

      {/* Text */}
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-2xl font-bold text-slate-900 dark:text-white mb-2"
      >
        No Classification History
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-slate-500 dark:text-slate-400 max-w-md mb-8"
      >
        Your classification history will appear here once you classify your first product.
        Start by describing a product to get its HS code.
      </motion.p>

      {/* CTA Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Link
          href="/classify"
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all',
            'bg-gradient-to-r from-cyan-500 to-blue-600 text-white',
            'shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/30',
            'hover:shadow-xl hover:from-cyan-400 hover:to-blue-500',
            'active:scale-[0.98]'
          )}
        >
          <Sparkles className="w-5 h-5" />
          Classify Your First Product
          <ArrowRight className="w-5 h-5" />
        </Link>
      </motion.div>

      {/* Tips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl"
      >
        {[
          { title: 'Describe Products', desc: 'Enter any product description in natural language' },
          { title: 'Answer Questions', desc: 'Clarify product details through guided questions' },
          { title: 'Get HS Codes', desc: 'Receive accurate HS codes with confidence scores' },
        ].map((tip, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center mb-2">
              <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                {idx + 1}
              </span>
            </div>
            <h3 className="font-medium text-slate-900 dark:text-white text-sm mb-1">
              {tip.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tip.desc}
            </p>
          </div>
        ))}
      </motion.div>
    </motion.div>
  )
}

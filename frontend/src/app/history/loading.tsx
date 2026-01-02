'use client'

import { motion } from 'framer-motion'

/**
 * Loading State for History Page
 *
 * Shows skeleton loaders while history data is being fetched.
 */
export default function HistoryLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 transition-colors duration-300">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div className="w-48 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>
          </div>

          {/* Search Bar Skeleton */}
          <div className="mt-4">
            <div className="w-full h-11 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Stats Skeleton */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
            >
              <div className="w-20 h-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mb-2" />
              <div className="w-12 h-8 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* History List Skeleton */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="w-3/4 h-5 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    <div className="w-16 h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    <div className="w-16 h-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    <div className="w-24 h-4 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

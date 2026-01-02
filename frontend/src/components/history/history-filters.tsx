'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, TrendingUp, BookOpen, RotateCcw } from 'lucide-react'
import type { HistoryFilters, HistoryItem } from '@/lib/hooks/use-history'
import { cn } from '@/lib/cn'

interface HistoryFiltersPanelProps {
  filters: HistoryFilters
  onFiltersChange: (filters: HistoryFilters) => void
  history: HistoryItem[]
}

// Get unique chapters from history
function getUniqueChapters(history: HistoryItem[]): { code: string; count: number }[] {
  const chapterMap = new Map<string, number>()

  history.forEach(item => {
    const chapter = item.hsCode.slice(0, 2)
    chapterMap.set(chapter, (chapterMap.get(chapter) || 0) + 1)
  })

  return Array.from(chapterMap.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
}

export function HistoryFiltersPanel({
  filters,
  onFiltersChange,
  history,
}: HistoryFiltersPanelProps) {
  const chapters = useMemo(() => getUniqueChapters(history), [history])

  const hasActiveFilters = !!(
    filters.dateRange ||
    filters.confidenceMin !== undefined ||
    filters.chapter
  )

  const handleDateRangeChange = (range: 'today' | 'week' | 'month' | 'all') => {
    if (range === 'all') {
      onFiltersChange({ ...filters, dateRange: undefined })
      return
    }

    const now = new Date()
    let start: Date

    switch (range) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        const dayOfWeek = now.getDay()
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek)
        break
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      default:
        start = new Date(0)
    }

    onFiltersChange({
      ...filters,
      dateRange: { start, end: now },
    })
  }

  const handleConfidenceChange = (min: number | undefined) => {
    onFiltersChange({
      ...filters,
      confidenceMin: min,
    })
  }

  const handleChapterChange = (chapter: string | undefined) => {
    onFiltersChange({
      ...filters,
      chapter,
    })
  }

  const clearFilters = () => {
    onFiltersChange({})
  }

  // Determine active date range
  const getActiveDateRange = () => {
    if (!filters.dateRange) return 'all'
    const { start } = filters.dateRange
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    if (start.getTime() === today.getTime()) return 'today'
    if (start.getTime() === weekStart.getTime()) return 'week'
    if (start.getTime() === monthStart.getTime()) return 'month'
    return 'custom'
  }

  const activeDateRange = getActiveDateRange()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Filter Groups */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Date Range Filter */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            <Calendar className="w-3.5 h-3.5" />
            Date Range
          </label>
          <div className="flex flex-wrap gap-2">
            {(['today', 'week', 'month', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => handleDateRangeChange(range)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeDateRange === range
                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                {range === 'all' ? 'All Time' : range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Confidence Filter */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            <TrendingUp className="w-3.5 h-3.5" />
            Min Confidence
          </label>
          <div className="flex flex-wrap gap-2">
            {[undefined, 90, 80, 60].map((min) => (
              <button
                key={min ?? 'any'}
                onClick={() => handleConfidenceChange(min)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  filters.confidenceMin === min
                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                {min ? `${min}%+` : 'Any'}
              </button>
            ))}
          </div>
        </div>

        {/* Chapter Filter */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            <BookOpen className="w-3.5 h-3.5" />
            HS Chapter
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleChapterChange(undefined)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                !filters.chapter
                  ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent hover:border-slate-300 dark:hover:border-slate-600'
              )}
            >
              All
            </button>
            {chapters.slice(0, 5).map(({ code, count }) => (
              <button
                key={code}
                onClick={() => handleChapterChange(code)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  filters.chapter === code
                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                Ch. {code}
                <span className="ml-1 text-slate-400 dark:text-slate-500">({count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end"
        >
          <button
            onClick={clearFilters}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear Filters
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}

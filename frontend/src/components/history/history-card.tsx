'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  MessageSquare,
  Clock,
  Layers,
  ChevronRight,
  Trash2,
  Copy,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react'
import type { HistoryItem } from '@/lib/hooks/use-history'
import { cn } from '@/lib/cn'

interface HistoryCardProps {
  item: HistoryItem
  formatTimestamp: (timestamp: number) => string
  onViewDetails: () => void
  onDelete: () => void
  isSelected?: boolean
  onToggleSelect?: () => void
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 80) return 'bg-emerald-500'
  if (confidence >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

function getConfidenceBadgeClasses(confidence: number) {
  if (confidence >= 80) {
    return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
  }
  if (confidence >= 60) {
    return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
  }
  return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30'
}

export function HistoryCard({
  item,
  formatTimestamp,
  onViewDetails,
  onDelete,
  isSelected,
  onToggleSelect,
}: HistoryCardProps) {
  const [copied, setCopied] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const questionsCount = item.sessionDetails?.totalQuestions || item.questionsAsked || 0
  const processingTime = item.sessionDetails?.processingTimeMs || item.processingTimeMs
  const alternativesCount = item.alternatives?.length || 0

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(item.hsCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (showConfirmDelete) {
      onDelete()
    } else {
      setShowConfirmDelete(true)
      setTimeout(() => setShowConfirmDelete(false), 3000)
    }
  }

  return (
    <motion.div
      layout
      className={cn(
        'group relative p-4 rounded-xl border transition-all duration-200',
        'bg-white dark:bg-slate-800/50',
        isSelected
          ? 'border-cyan-500 ring-2 ring-cyan-500/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
        'hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50'
      )}
    >
      {/* Selection Checkbox */}
      {onToggleSelect && (
        <div className="absolute top-4 left-4">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect()
            }}
            className={cn(
              'w-5 h-5 rounded border-2 transition-all',
              isSelected
                ? 'bg-cyan-500 border-cyan-500'
                : 'border-slate-300 dark:border-slate-600 hover:border-cyan-500 dark:hover:border-cyan-500'
            )}
          >
            {isSelected && (
              <CheckCircle2 className="w-full h-full text-white p-0.5" />
            )}
          </button>
        </div>
      )}

      <div className={cn('flex items-start gap-4', onToggleSelect && 'ml-8')}>
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Product Description */}
          <h3 className="text-base font-medium text-slate-900 dark:text-white line-clamp-2 mb-2">
            {item.productDescription}
          </h3>

          {/* HS Code and Confidence */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {/* HS Code */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-cyan-600 dark:text-cyan-400">
                {item.hsCode}
              </span>
              <button
                onClick={handleCopy}
                className={cn(
                  'p-1 rounded transition-colors',
                  copied
                    ? 'text-emerald-500'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                )}
                title="Copy HS Code"
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Confidence Badge */}
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-semibold border',
                getConfidenceBadgeClasses(item.confidence)
              )}
            >
              {item.confidence}%
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-1 mb-3">
            {item.description}
          </p>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            {/* Timestamp */}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatTimestamp(item.timestamp)}
            </div>

            {/* Questions */}
            {questionsCount > 0 && (
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                {questionsCount} question{questionsCount !== 1 ? 's' : ''}
              </div>
            )}

            {/* Processing Time */}
            {processingTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {(processingTime / 1000).toFixed(1)}s
              </div>
            )}

            {/* Alternatives */}
            {alternativesCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                {alternativesCount} alternative{alternativesCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {/* View Details Button */}
          <button
            onClick={onViewDetails}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-slate-100 dark:bg-slate-700',
              'text-slate-700 dark:text-slate-200',
              'hover:bg-cyan-100 dark:hover:bg-cyan-500/20',
              'hover:text-cyan-700 dark:hover:text-cyan-300'
            )}
          >
            View Details
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Classify Again Link */}
          <Link
            href={`/classify?q=${encodeURIComponent(item.productDescription)}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              'text-slate-500 dark:text-slate-400',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Classify Again</span>
          </Link>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              showConfirmDelete
                ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
                : 'text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {showConfirmDelete ? 'Confirm?' : 'Delete'}
            </span>
          </button>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-xl overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${item.confidence}%` }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={cn('h-full', getConfidenceColor(item.confidence))}
        />
      </div>
    </motion.div>
  )
}

'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  X,
  Copy,
  CheckCircle2,
  Clock,
  MessageSquare,
  Layers,
  ExternalLink,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
  Sparkles,
} from 'lucide-react'
import type { HistoryItem } from '@/lib/hooks/use-history'
import { cn } from '@/lib/cn'

interface HistoryDetailModalProps {
  item: HistoryItem
  formatFullDate: (timestamp: number) => string
  onClose: () => void
  onDelete: () => void
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 80) return 'text-emerald-500'
  if (confidence >= 60) return 'text-amber-500'
  return 'text-red-500'
}

function getConfidenceBg(confidence: number) {
  if (confidence >= 80) return 'bg-emerald-500'
  if (confidence >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export function HistoryDetailModal({
  item,
  formatFullDate,
  onClose,
  onDelete,
}: HistoryDetailModalProps) {
  const [copied, setCopied] = useState(false)
  const [showAlternatives, setShowAlternatives] = useState(true)
  const [showReasoning, setShowReasoning] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.hsCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = () => {
    if (showConfirmDelete) {
      onDelete()
    } else {
      setShowConfirmDelete(true)
      setTimeout(() => setShowConfirmDelete(false), 3000)
    }
  }

  const questions = item.sessionDetails?.questions || []
  const alternatives = item.alternatives || []
  const processingTime = item.sessionDetails?.processingTimeMs || item.processingTimeMs

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed inset-4 md:inset-y-8 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
              Classified on {formatFullDate(item.timestamp)}
            </p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white line-clamp-2">
              {item.productDescription}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Result Card */}
          <div className="relative p-6 rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-500/10 dark:to-blue-500/10 border border-cyan-200 dark:border-cyan-500/30">
            {/* HS Code */}
            <div className="flex items-center gap-3 mb-4">
              <span className="font-mono text-3xl md:text-4xl font-bold text-cyan-600 dark:text-cyan-400">
                {item.hsCode}
              </span>
              <button
                onClick={handleCopy}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  copied
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-white/50 dark:bg-white/5 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400'
                )}
              >
                {copied ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Description */}
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              {item.description}
            </p>

            {/* Confidence */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Confidence:
              </span>
              <div className="flex-1 h-2 rounded-full bg-white/50 dark:bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.confidence}%` }}
                  transition={{ duration: 0.5 }}
                  className={cn('h-full rounded-full', getConfidenceBg(item.confidence))}
                />
              </div>
              <span className={cn('text-lg font-bold', getConfidenceColor(item.confidence))}>
                {item.confidence}%
              </span>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-cyan-200 dark:border-cyan-500/30">
              {processingTime && (
                <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <Clock className="w-4 h-4" />
                  {(processingTime / 1000).toFixed(1)}s
                </div>
              )}
              {questions.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <MessageSquare className="w-4 h-4" />
                  {questions.length} question{questions.length !== 1 ? 's' : ''}
                </div>
              )}
              {alternatives.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <Layers className="w-4 h-4" />
                  {alternatives.length} alternative{alternatives.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Verify Link */}
            <div className="mt-4">
              <a
                href={`https://www.cbic.gov.in/htdocs-cbec/customs/cst-search/search?gscode=${item.hsCode.replace(/\./g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  'bg-white dark:bg-white/10',
                  'text-cyan-700 dark:text-cyan-300',
                  'hover:bg-cyan-100 dark:hover:bg-cyan-500/20'
                )}
              >
                <ExternalLink className="w-4 h-4" />
                Verify on CBIC
              </a>
            </div>
          </div>

          {/* Classification Path */}
          {questions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-500" />
                Classification Path ({questions.length} Questions)
              </h3>
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="relative pl-6"
                  >
                    {/* Timeline connector */}
                    {idx < questions.length - 1 && (
                      <div className="absolute left-[9px] top-10 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                    )}

                    {/* Question */}
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-500/20 border-2 border-cyan-500 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                          {idx + 1}
                        </span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                          <Bot className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {q.questionText}
                          </p>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30 ml-4">
                          <User className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                              {q.answerLabel}
                            </p>
                            {q.answerCode && (
                              <p className="text-xs font-mono text-cyan-500 dark:text-cyan-400 mt-0.5">
                                Code: {q.answerCode}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Alternative Codes */}
          {alternatives.length > 0 && (
            <div>
              <button
                onClick={() => setShowAlternatives(!showAlternatives)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <Layers className="w-4 h-4 text-purple-500" />
                  Alternative Codes ({alternatives.length})
                </span>
                {showAlternatives ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {showAlternatives && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mt-2 space-y-2"
                >
                  {alternatives.map((alt) => (
                    <div
                      key={alt.code}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {alt.code}
                        </span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {alt.description}
                        </span>
                      </div>
                      {alt.confidence && (
                        <span className="text-xs font-medium text-slate-400">
                          {alt.confidence}%
                        </span>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          )}

          {/* Reasoning */}
          {item.reasoning && (
            <div>
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Classification Reasoning
                </span>
                {showReasoning ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {showReasoning && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mt-2 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                >
                  <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                    {item.reasoning}
                  </p>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={handleDelete}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              showConfirmDelete
                ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
                : 'text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
            )}
          >
            <Trash2 className="w-4 h-4" />
            {showConfirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>

          <div className="flex items-center gap-2">
            <Link
              href={`/classify?q=${encodeURIComponent(item.productDescription)}`}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-slate-200 dark:bg-slate-700',
                'text-slate-700 dark:text-slate-200',
                'hover:bg-slate-300 dark:hover:bg-slate-600'
              )}
            >
              <RotateCcw className="w-4 h-4" />
              Classify Again
            </Link>
            <button
              onClick={onClose}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-cyan-500 text-white',
                'hover:bg-cyan-600'
              )}
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

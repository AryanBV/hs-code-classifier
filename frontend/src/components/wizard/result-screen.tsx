'use client'

import { motion } from 'framer-motion'
import { RotateCcw, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { SuccessAnimation } from './success-animation'
import { HsCodeDisplay } from './hs-code-display'
import { ClassificationTree } from './classification-tree'
import { AlternativeCodes } from './alternative-codes'
import { OfficialSources } from './official-sources'
import { FeedbackWidget } from '../classify/feedback-widget'
import {
  parseReasoning,
  generateClassificationPath,
  generatePathFromHsCode,
} from '@/lib/utils/parse-reasoning'
import { ClassificationResult, Selection } from '@/lib/hooks/use-wizard'
import { cn } from '@/lib/cn'

// ============================================================================
// Types
// ============================================================================

interface ResultScreenProps {
  result: ClassificationResult
  product: string
  selections: Selection[]
  conversationId: string | null
  onClassifyAnother: () => void
}

// ============================================================================
// Component
// ============================================================================

export function ResultScreen({
  result,
  product,
  selections,
  conversationId,
  onClassifyAnother,
}: ResultScreenProps) {
  const [showReasoning, setShowReasoning] = useState(false)

  // Parse reasoning to get structured classification path
  const parsedReasoning = parseReasoning(result.reasoning)
  const classificationPath = parsedReasoning
    ? generateClassificationPath(parsedReasoning)
    : generatePathFromHsCode(result.code, result.description)

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 sm:py-8 overflow-y-auto">
      <div className="w-full max-w-lg">
        {/* Success Header */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-4">
            <SuccessAnimation size="lg" />
          </div>

          <motion.h1
            className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            Classification Complete
          </motion.h1>

          <motion.p
            className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
          >
            for &ldquo;{product}&rdquo;
          </motion.p>
        </motion.div>

        {/* Main Content */}
        <div className="space-y-4">
          {/* HS Code Card */}
          <HsCodeDisplay
            code={result.code}
            description={result.description}
            confidence={result.confidence}
          />

          {/* Classification Tree */}
          {classificationPath.length > 0 && (
            <motion.div
              className="bg-white dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.3 }}
            >
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <span className="text-cyan-500">
                  {'\u{1F4CA}'} {/* Chart emoji */}
                </span>
                Classification Breakdown
              </h3>
              <ClassificationTree path={classificationPath} />
            </motion.div>
          )}

          {/* Reasoning Panel (collapsible) - for selections made */}
          {selections.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-xl transition-all',
                  'bg-slate-50 dark:bg-slate-800/50',
                  'border border-slate-200 dark:border-slate-700',
                  'hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
                    <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">
                    Your Selections ({selections.length})
                  </span>
                </div>
                {showReasoning ? (
                  <ChevronUp className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                )}
              </button>

              {showReasoning && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      'p-4 mt-2 rounded-xl space-y-3',
                      'bg-slate-50 dark:bg-slate-800/30',
                      'border border-slate-200 dark:border-slate-700'
                    )}
                  >
                    {selections.map((selection, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-2 rounded-lg bg-white dark:bg-slate-700/30"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center text-xs font-medium text-cyan-700 dark:text-cyan-400">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                            {selection.questionText}
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {selection.answerLabel}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Alternative Codes */}
          <AlternativeCodes
            alternatives={result.alternatives || []}
          />

          {/* Official Sources */}
          <OfficialSources hsCode={result.code} />

          {/* Feedback Widget */}
          {conversationId && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.3 }}
              className={cn(
                'p-4 rounded-xl',
                'bg-slate-50 dark:bg-slate-800/50',
                'border border-slate-200 dark:border-slate-700'
              )}
            >
              <FeedbackWidget
                classificationId={conversationId}
                productDescription={product}
                suggestedCode={result.code}
              />
            </motion.div>
          )}
        </div>

        {/* Start Over Button */}
        <motion.div
          className="mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.3 }}
        >
          <button
            onClick={onClassifyAnother}
            className={cn(
              'w-full py-3 px-4 rounded-xl font-medium',
              'bg-gradient-to-r from-cyan-500 to-blue-600 text-white',
              'shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/30',
              'hover:shadow-xl hover:from-cyan-400 hover:to-blue-500',
              'active:scale-[0.98] transition-all duration-200',
              'flex items-center justify-center gap-2'
            )}
          >
            <RotateCcw className="w-4 h-4" />
            Classify Another Product
          </button>
        </motion.div>
      </div>
    </div>
  )
}

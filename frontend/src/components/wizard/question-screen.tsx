'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { CurrentQuestion, Selection } from '@/lib/hooks/use-wizard'
import { ProductContext } from './product-context'
import { QuestionProgress } from './question-progress'
import { QuestionHeader } from './question-header'
import { BreadcrumbTrail } from './breadcrumb-trail'
import { OptionCard } from './option-card'
import { OptionSkeleton } from './option-skeleton'

// ============================================================================
// Types
// ============================================================================

interface QuestionScreenProps {
  product: string
  question: CurrentQuestion
  onSelectOption: (index: number) => void
  onGoBack: () => void
  selections: Selection[]
  progress: { current: number; total: number; percentage: number } | null
  isLoading: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * QuestionScreen - Premium question interface
 * Clean, professional design with dynamic context
 */
export function QuestionScreen({
  product,
  question,
  onSelectOption,
  onGoBack,
  selections,
  progress,
  isLoading,
}: QuestionScreenProps) {
  // Guard against undefined question during AnimatePresence exit animations
  if (!question || !question.options) {
    return null
  }

  const questionNumber = progress?.current || 1
  const estimatedTotal = progress?.total || 4

  return (
    <div className="flex-1 flex flex-col">
      {/* Main content area with padding */}
      <div className="flex-1 px-4 py-6 md:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Product Context Banner */}
          <ProductContext product={product} />

          {/* Progress Indicator */}
          <QuestionProgress
            current={questionNumber}
            estimated={estimatedTotal}
          />

          {/* Breadcrumb Trail */}
          {selections.length > 0 && (
            <BreadcrumbTrail selections={selections} />
          )}

          {/* Question Header - Dynamic Title */}
          <div className="pt-4">
            <QuestionHeader questionNumber={questionNumber} />
          </div>

          {/* Options */}
          <div className="space-y-3 pt-2">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <OptionSkeleton count={4} />
                </motion.div>
              ) : (
                <motion.div
                  key={`question-${questionNumber}`}
                  className="space-y-3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  role="listbox"
                  aria-label="Classification options"
                >
                  {(question.options || []).map((option, index) => (
                    <OptionCard
                      key={`${option.code || option.label}-${index}`}
                      label={option.label}
                      code={option.code}
                      index={index}
                      onClick={() => onSelectOption(index)}
                      disabled={isLoading}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Back Button */}
          <motion.div
            className="pt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <button
              type="button"
              onClick={onGoBack}
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

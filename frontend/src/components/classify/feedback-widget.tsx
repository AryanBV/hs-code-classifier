'use client'

import { useState } from 'react'
import { Check, X, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { submitFeedback } from '@/lib/api-client'

interface FeedbackWidgetProps {
  classificationId: string
  productDescription: string
  suggestedCode: string
}

type FeedbackType = 'correct' | 'incorrect' | 'unsure' | null

// Map feedback type to rating (1-5 scale for backend)
const feedbackToRating: Record<'correct' | 'incorrect' | 'unsure', number> = {
  correct: 5,
  incorrect: 1,
  unsure: 3,
}

export function FeedbackWidget({
  classificationId,
  productDescription,
  suggestedCode,
}: FeedbackWidgetProps) {
  const [feedback, setFeedback] = useState<FeedbackType>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (type: 'correct' | 'incorrect' | 'unsure') => {
    setIsSubmitting(true)
    try {
      await submitFeedback({
        classificationId,
        productDescription,
        suggestedCode,
        rating: feedbackToRating[type],
        feedback: type,
      })
      setFeedback(type)
    } catch (error) {
      console.error('Failed to submit feedback:', error)
      // Still show the feedback as selected for UX
      setFeedback(type)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (feedback) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span>Thanks for your feedback!</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">Was this classification correct?</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleFeedback('correct')}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
            'border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800',
            'text-slate-700 dark:text-slate-200',
            'hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
            'hover:border-emerald-300 dark:hover:border-emerald-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Correct
        </button>
        <button
          onClick={() => handleFeedback('incorrect')}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
            'border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800',
            'text-slate-700 dark:text-slate-200',
            'hover:bg-red-50 dark:hover:bg-red-500/10',
            'hover:border-red-300 dark:hover:border-red-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <X className="h-4 w-4 text-red-600 dark:text-red-400" />
          Wrong
        </button>
        <button
          onClick={() => handleFeedback('unsure')}
          disabled={isSubmitting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
            'border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800',
            'text-slate-700 dark:text-slate-200',
            'hover:bg-amber-50 dark:hover:bg-amber-500/10',
            'hover:border-amber-300 dark:hover:border-amber-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Unsure
        </button>
      </div>
    </div>
  )
}

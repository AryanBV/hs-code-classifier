'use client'

import { useState } from 'react'
import { Check, X, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-success" />
        <span>Thanks for your feedback!</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Was this classification correct?</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback('correct')}
          disabled={isSubmitting}
          className="gap-1.5"
        >
          <Check className="h-4 w-4 text-success" />
          Correct
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback('incorrect')}
          disabled={isSubmitting}
          className="gap-1.5"
        >
          <X className="h-4 w-4 text-destructive" />
          Wrong
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback('unsure')}
          disabled={isSubmitting}
          className="gap-1.5"
        >
          <HelpCircle className="h-4 w-4 text-warning" />
          Unsure
        </Button>
      </div>
    </div>
  )
}

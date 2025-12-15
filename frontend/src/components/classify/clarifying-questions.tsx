'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, ArrowRight, SkipForward, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { ClarifyingQuestion } from '@/lib/api-client'

interface ClarifyingQuestionsProps {
  questions: ClarifyingQuestion[]
  context: string
  roundNumber: number
  totalQuestionsAsked: number
  onSubmit: (answers: Record<string, string>) => void
  onSkip: () => void
  isLoading: boolean
}

export function ClarifyingQuestions({
  questions,
  context,
  roundNumber,
  totalQuestionsAsked,
  onSubmit,
  onSkip,
  isLoading
}: ClarifyingQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({})
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
    // Reset answers when questions change
    setAnswers({})
    setOtherTexts({})
  }, [questions])

  const handleOptionSelect = (questionId: string, option: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: option
    }))
    // Clear other text if selecting a predefined option
    if (option !== 'other') {
      setOtherTexts(prev => {
        const newTexts = { ...prev }
        delete newTexts[questionId]
        return newTexts
      })
    }
  }

  const handleOtherTextChange = (questionId: string, text: string) => {
    setOtherTexts(prev => ({
      ...prev,
      [questionId]: text
    }))
    // Mark as "other" in answers
    setAnswers(prev => ({
      ...prev,
      [questionId]: 'other'
    }))
  }

  const handleSubmit = () => {
    // Build final answers with "other:" prefix for custom text
    const finalAnswers: Record<string, string> = {}
    for (const [questionId, answer] of Object.entries(answers)) {
      if (answer === 'other' && otherTexts[questionId]) {
        finalAnswers[questionId] = `other:${otherTexts[questionId]}`
      } else {
        finalAnswers[questionId] = answer
      }
    }
    onSubmit(finalAnswers)
  }

  // Check if any question is answered (for enabling submit)
  const anyAnswered = Object.keys(answers).length > 0

  const maxRounds = 3

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full"
      >
        <Card className="border-primary/20 shadow-glow overflow-hidden">
          <CardContent className="p-0">
            {/* Header */}
            <div className="relative p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              {/* Background glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl" />

              <div className="relative flex items-start gap-4">
                <div className="flex-shrink-0 p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">Quick Questions</h3>
                    <Badge variant="outline" className="bg-primary/10 border-primary/30">
                      Round {roundNumber} of {maxRounds}
                    </Badge>
                  </div>

                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {context || 'To provide the most accurate HS code, we need a bit more information about your product.'}
                  </p>
                </div>
              </div>

              {/* Progress indicator */}
              <div className="flex items-center gap-2 mt-4">
                {[1, 2, 3].map((round) => (
                  <div
                    key={round}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors duration-300',
                      round < roundNumber
                        ? 'bg-primary'
                        : round === roundNumber
                        ? 'bg-primary/60'
                        : 'bg-muted'
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Questions */}
            <div className="p-6 space-y-6">
              {questions.map((question, index) => (
                <motion.div
                  key={question.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.3 }}
                  className="space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {question.text}
                        {question.priority === 'required' && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Options - filter out "Other" since we add it separately with text input */}
                  <div className="flex flex-wrap gap-2 ml-8">
                    {question.options
                      .filter((option) => option.toLowerCase() !== 'other')
                      .map((option) => (
                        <Button
                          key={option}
                          type="button"
                          variant={answers[question.id] === option ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleOptionSelect(question.id, option)}
                          disabled={isLoading}
                          className={cn(
                            'transition-all duration-200',
                            answers[question.id] === option
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                              : 'hover:border-primary/50'
                          )}
                        >
                          {option}
                        </Button>
                      ))}
                  </div>

                  {/* Other option */}
                  {question.allowOther && (
                    <div className="ml-8 flex items-center gap-2">
                      <Button
                        type="button"
                        variant={answers[question.id] === 'other' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleOptionSelect(question.id, 'other')}
                        disabled={isLoading}
                        className={cn(
                          'transition-all duration-200 flex-shrink-0',
                          answers[question.id] === 'other'
                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                            : 'hover:border-primary/50'
                        )}
                      >
                        Other
                      </Button>

                      <AnimatePresence>
                        {answers[question.id] === 'other' && (
                          <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="flex-1 overflow-hidden"
                          >
                            <Input
                              type="text"
                              placeholder="Please specify..."
                              value={otherTexts[question.id] || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOtherTextChange(question.id, e.target.value)}
                              disabled={isLoading}
                              className="h-9"
                              autoFocus
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Actions */}
            <div className="border-t border-border p-4 bg-card/50">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  onClick={handleSubmit}
                  disabled={!anyAnswered || isLoading}
                  className="flex-1 sm:flex-initial gap-2"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                      />
                      Processing...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  onClick={onSkip}
                  disabled={isLoading}
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip & Get Best Guess
                </Button>
              </div>

              {/* Help text */}
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <HelpCircle className="w-3 h-3" />
                <span>
                  {totalQuestionsAsked} of 5 questions asked. More specific answers lead to more accurate classification.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}

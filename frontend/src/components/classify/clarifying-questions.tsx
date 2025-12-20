'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, SkipForward, HelpCircle, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { ClarifyingQuestion } from '@/lib/api-client'
import { AIAvatar } from './ai-avatar'

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)

  useEffect(() => {
    setIsVisible(true)
    // Reset answers when questions change
    setAnswers({})
    setOtherTexts({})
    setCurrentQuestionIndex(0)
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

    // Auto-advance to next question after a short delay
    if (option !== 'other') {
      setTimeout(() => {
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1)
        }
      }, 300)
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
  const allAnswered = questions.every(q => answers[q.id])

  const maxRounds = 3

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-3xl mx-auto"
      >
        {/* AI Message Bubble */}
        <div className="flex gap-3 mb-6">
          <div className="flex-shrink-0">
            <AIAvatar state="speaking" size="md" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Context message */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="relative p-4 rounded-2xl rounded-tl-md bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm mb-4"
            >
              {/* Glow effect */}
              <div className="absolute -inset-px rounded-2xl rounded-tl-md bg-gradient-to-r from-cyan-500/20 to-blue-500/20 blur-sm -z-10" />

              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium text-cyan-400">
                  Round {roundNumber} of {maxRounds}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-500">
                  {totalQuestionsAsked} questions asked
                </span>
              </div>

              <p className="text-slate-200 leading-relaxed">
                {context || 'To provide the most accurate HS code, I need a bit more information about your product.'}
              </p>
            </motion.div>

            {/* Questions */}
            <div className="space-y-4">
              {questions.map((question, index) => (
                <motion.div
                  key={question.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                  }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className={cn(
                    'relative p-4 rounded-xl border transition-all duration-300',
                    currentQuestionIndex === index
                      ? 'bg-slate-800/80 border-cyan-500/50 shadow-glow'
                      : answers[question.id]
                      ? 'bg-slate-800/40 border-emerald-500/30'
                      : 'bg-slate-800/40 border-slate-700/50 opacity-60'
                  )}
                >
                  {/* Answered indicator */}
                  {answers[question.id] && answers[question.id] !== 'other' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
                    >
                      <Check className="w-3.5 h-3.5 text-white" />
                    </motion.div>
                  )}

                  {/* Question number badge */}
                  <div className="flex items-start gap-3 mb-3">
                    <span className={cn(
                      'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      currentQuestionIndex === index
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : answers[question.id]
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-700 text-slate-400'
                    )}>
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-white">
                        {question.text}
                        {question.priority === 'required' && (
                          <span className="text-red-400 ml-1">*</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Options as pills */}
                  <div className="flex flex-wrap gap-2 ml-9">
                    {question.options
                      .filter((option) => option.toLowerCase() !== 'other')
                      .map((option, optIndex) => (
                        <motion.button
                          key={option}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 + index * 0.1 + optIndex * 0.05 }}
                          onClick={() => handleOptionSelect(question.id, option)}
                          disabled={isLoading}
                          className={cn(
                            'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                            answers[question.id] === option
                              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-glow'
                              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-600/50 hover:border-cyan-500/50'
                          )}
                        >
                          {option}
                        </motion.button>
                      ))}

                    {/* Other option */}
                    {question.allowOther && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                        onClick={() => handleOptionSelect(question.id, 'other')}
                        disabled={isLoading}
                        className={cn(
                          'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                          answers[question.id] === 'other'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-600/50 border-dashed'
                        )}
                      >
                        Other...
                      </motion.button>
                    )}
                  </div>

                  {/* Other text input */}
                  <AnimatePresence>
                    {answers[question.id] === 'other' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="ml-9 mt-3 overflow-hidden"
                      >
                        <Input
                          type="text"
                          placeholder="Please specify..."
                          value={otherTexts[question.id] || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOtherTextChange(question.id, e.target.value)}
                          disabled={isLoading}
                          className="bg-slate-900/50 border-slate-600 focus:border-cyan-500 text-white placeholder-slate-500"
                          autoFocus
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions bar - fixed at bottom like chat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm"
        >
          <Button
            onClick={handleSubmit}
            disabled={!anyAnswered || isLoading}
            className={cn(
              'flex-1 sm:flex-initial gap-2 h-11 transition-all duration-300',
              allAnswered
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 shadow-glow-success'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700'
            )}
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
                {allAnswered ? 'Get Classification' : 'Continue'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={onSkip}
            disabled={isLoading}
            className="gap-2 text-slate-400 hover:text-white hover:bg-slate-700/50"
          >
            <SkipForward className="w-4 h-4" />
            Skip & Get Best Guess
          </Button>

          {/* Progress indicator */}
          <div className="hidden sm:flex items-center gap-2 ml-auto text-xs text-slate-500">
            <div className="flex gap-1">
              {[1, 2, 3].map((round) => (
                <div
                  key={round}
                  className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    round < roundNumber
                      ? 'bg-cyan-500'
                      : round === roundNumber
                      ? 'bg-cyan-500/50'
                      : 'bg-slate-700'
                  )}
                />
              ))}
            </div>
            <span>{Object.keys(answers).length} answered</span>
          </div>
        </motion.div>

        {/* Help text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-500"
        >
          <HelpCircle className="w-3 h-3" />
          <span>More specific answers lead to more accurate classification</span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

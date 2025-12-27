'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, SkipForward, HelpCircle, Check, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { ClarifyingQuestion } from '@/lib/api-client'
import { AIAvatar } from './ai-avatar'

/**
 * Parse option string to extract code and display label
 * Format: "CODE::FRIENDLY_LABEL" or legacy "CODE: Description"
 */
function parseOption(option: string): { code: string; label: string; fullValue: string } {
  // New format: CODE::LABEL
  if (option.includes('::')) {
    const [code, label] = option.split('::')
    return {
      code: code?.trim() || option,
      label: label?.trim() || option,
      fullValue: option
    }
  }
  // Legacy format: CODE: Description
  if (option.includes(':')) {
    const colonIndex = option.indexOf(':')
    const code = option.substring(0, colonIndex).trim()
    const label = option.substring(colonIndex + 1).trim()
    // If label is too long or technical, simplify it
    const cleanLabel = label.length > 60 ? label.substring(0, 57) + '...' : label
    return {
      code,
      label: cleanLabel,
      fullValue: option
    }
  }
  // No separator, use as-is
  return {
    code: option,
    label: option,
    fullValue: option
  }
}

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

  // Track previous questions to only reset when content actually changes
  const prevQuestionsRef = useRef<string>('')

  useEffect(() => {
    // Create a stable key from questions to detect actual content changes
    const questionsKey = questions.map(q => q.id).join('|')

    // Only reset state if the questions actually changed (not just re-render)
    if (questionsKey !== prevQuestionsRef.current) {
      setIsVisible(true)
      setAnswers({})
      setOtherTexts({})
      setCurrentQuestionIndex(0)
      prevQuestionsRef.current = questionsKey
    }
  }, [questions])

  const handleOptionSelect = (questionId: string, option: string) => {
    const isCurrentlySelected = answers[questionId] === option

    if (isCurrentlySelected) {
      setAnswers(prev => {
        const newAnswers = { ...prev }
        delete newAnswers[questionId]
        return newAnswers
      })
      setOtherTexts(prev => {
        const newTexts = { ...prev }
        delete newTexts[questionId]
        return newTexts
      })
      return
    }

    setAnswers(prev => ({
      ...prev,
      [questionId]: option
    }))
    if (option !== 'other') {
      setOtherTexts(prev => {
        const newTexts = { ...prev }
        delete newTexts[questionId]
        return newTexts
      })
    }

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
    setAnswers(prev => ({
      ...prev,
      [questionId]: 'other'
    }))
  }

  const handleSubmit = () => {
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
            <div className="space-y-6">
              {questions.map((question, index) => {
                const selectedAnswer = answers[question.id]
                const isOtherSelected = selectedAnswer === 'other'

                return (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + index * 0.1 }}
                    className={cn(
                      'relative p-5 rounded-2xl border-2 transition-all duration-300',
                      currentQuestionIndex === index
                        ? 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                        : selectedAnswer
                        ? 'bg-gradient-to-br from-emerald-950/40 to-slate-900/60 border-emerald-500/40'
                        : 'bg-slate-800/40 border-slate-700/50 opacity-70'
                    )}
                  >
                    {/* Question header */}
                    <div className="flex items-start gap-3 mb-4">
                      <span className={cn(
                        'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-300',
                        currentQuestionIndex === index
                          ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50'
                          : selectedAnswer
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50'
                          : 'bg-slate-700 text-slate-400'
                      )}>
                        {selectedAnswer ? <Check className="w-4 h-4" /> : index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-white text-base leading-tight">
                          {question.text}
                          {question.priority === 'required' && (
                            <span className="text-rose-400 ml-1">*</span>
                          )}
                        </p>

                        {/* Selected answer display - prominent and clear */}
                        <AnimatePresence mode="wait">
                          {selectedAnswer && selectedAnswer !== 'other' && (
                            <motion.div
                              initial={{ opacity: 0, y: -5, height: 0 }}
                              animate={{ opacity: 1, y: 0, height: 'auto' }}
                              exit={{ opacity: 0, y: -5, height: 0 }}
                              className="mt-2 overflow-hidden"
                            >
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-sm font-medium text-emerald-300">
                                  Selected: {parseOption(selectedAnswer).label}
                                </span>
                                <button
                                  onClick={() => handleOptionSelect(question.id, selectedAnswer)}
                                  className="ml-1 p-0.5 rounded hover:bg-emerald-500/30 transition-colors"
                                  title="Click to deselect"
                                >
                                  <X className="w-3.5 h-3.5 text-emerald-400 hover:text-white" />
                                </button>
                              </div>
                            </motion.div>
                          )}
                          {isOtherSelected && otherTexts[question.id] && (
                            <motion.div
                              initial={{ opacity: 0, y: -5, height: 0 }}
                              animate={{ opacity: 1, y: 0, height: 'auto' }}
                              exit={{ opacity: 0, y: -5, height: 0 }}
                              className="mt-2 overflow-hidden"
                            >
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40">
                                <Check className="w-3.5 h-3.5 text-purple-400" />
                                <span className="text-sm font-medium text-purple-300">
                                  Custom: {otherTexts[question.id]}
                                </span>
                                <button
                                  onClick={() => handleOptionSelect(question.id, 'other')}
                                  className="ml-1 p-0.5 rounded hover:bg-purple-500/30 transition-colors"
                                  title="Click to deselect"
                                >
                                  <X className="w-3.5 h-3.5 text-purple-400 hover:text-white" />
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Options grid */}
                    <div className="flex flex-wrap gap-2.5 ml-11">
                      {question.options
                        .filter((option) => {
                          const parsed = parseOption(option)
                          const labelLower = parsed.label.toLowerCase()

                          // Always filter out generic "none of the above" (no HS code prefix)
                          if (labelLower === 'none of the above' && parsed.code === parsed.label) return false

                          // Only filter out exact "Other" if it's a GENERIC option (no HS code prefix)
                          // Keep "Other" or "Other (not...)" if it has an HS code (e.g., "0902.20.90::Other" is a valid HS code)
                          if (labelLower === 'other' && parsed.code === parsed.label) {
                            return false
                          }

                          return true
                        })
                        .map((option, optIndex) => {
                          const parsed = parseOption(option)
                          const isSelected = selectedAnswer === option
                          return (
                            <motion.button
                              key={option}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              whileHover={{ scale: 1.03, y: -1 }}
                              whileTap={{ scale: 0.97 }}
                              transition={{
                                delay: 0.3 + index * 0.1 + optIndex * 0.03,
                                duration: 0.2,
                                type: "spring",
                                stiffness: 400,
                                damping: 25
                              }}
                              onClick={() => handleOptionSelect(question.id, option)}
                              disabled={isLoading}
                              className={cn(
                                'group relative px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                                isSelected
                                  ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/50 scale-105 ring-2 ring-emerald-300 ring-offset-2 ring-offset-slate-900'
                                  : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/80 hover:text-white border border-slate-600/60 hover:border-cyan-400/60 hover:shadow-lg hover:shadow-cyan-500/20'
                              )}
                            >
                              {/* Glow effect for selected */}
                              {isSelected && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="absolute inset-0 rounded-xl bg-emerald-400/30 blur-md -z-10"
                                />
                              )}

                              {/* Content with checkmark for selected */}
                              <span className="relative z-10 flex items-center gap-1.5">
                                {isSelected && (
                                  <motion.span
                                    initial={{ scale: 0, rotate: -45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    className="flex items-center justify-center"
                                  >
                                    <Check className="w-4 h-4" strokeWidth={3} />
                                  </motion.span>
                                )}
                                {parsed.label}
                                {/* X icon on hover for selected items */}
                                {isSelected && (
                                  <motion.span
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="ml-1 opacity-60 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </motion.span>
                                )}
                              </span>

                              {/* Floating badge for selected */}
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0, y: 10 }}
                                  animate={{ scale: 1, y: 0 }}
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-emerald-500"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={3} />
                                </motion.div>
                              )}
                            </motion.button>
                          )
                        })}

                      {/* Other option */}
                      {question.allowOther && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.03, y: -1 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ delay: 0.4 + index * 0.1, duration: 0.2 }}
                          onClick={() => handleOptionSelect(question.id, 'other')}
                          disabled={isLoading}
                          className={cn(
                            'group relative px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                            isOtherSelected
                              ? 'bg-gradient-to-br from-purple-400 via-purple-500 to-fuchsia-600 text-white shadow-xl shadow-purple-500/50 scale-105 ring-2 ring-purple-300 ring-offset-2 ring-offset-slate-900'
                              : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/80 hover:text-white border border-dashed border-slate-500/60 hover:border-purple-400/60'
                          )}
                        >
                          {isOtherSelected && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="absolute inset-0 rounded-xl bg-purple-400/30 blur-md -z-10"
                            />
                          )}

                          <span className="relative z-10 flex items-center gap-1.5">
                            {isOtherSelected && (
                              <motion.span
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                              >
                                <Check className="w-4 h-4" strokeWidth={3} />
                              </motion.span>
                            )}
                            Other...
                            {isOtherSelected && (
                              <motion.span
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="ml-1 opacity-60 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3.5 h-3.5" />
                              </motion.span>
                            )}
                          </span>

                          {isOtherSelected && (
                            <motion.div
                              initial={{ scale: 0, y: 10 }}
                              animate={{ scale: 1, y: 0 }}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-purple-500"
                            >
                              <Check className="w-3.5 h-3.5 text-purple-600" strokeWidth={3} />
                            </motion.div>
                          )}
                        </motion.button>
                      )}
                    </div>

                    {/* Other text input */}
                    <AnimatePresence>
                      {isOtherSelected && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="ml-11 mt-3 overflow-hidden"
                        >
                          <Input
                            type="text"
                            placeholder="Please specify your answer..."
                            value={otherTexts[question.id] || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleOtherTextChange(question.id, e.target.value)}
                            disabled={isLoading}
                            className="bg-slate-900/70 border-purple-500/50 focus:border-purple-400 focus:ring-purple-500/30 text-white placeholder-slate-500"
                            autoFocus
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700/50 backdrop-blur-sm"
        >
          <Button
            onClick={handleSubmit}
            disabled={!anyAnswered || isLoading}
            className={cn(
              'flex-1 sm:flex-initial gap-2 h-12 text-base font-semibold transition-all duration-300 rounded-xl',
              allAnswered
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/40 hover:shadow-emerald-500/60'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/30'
            )}
          >
            {isLoading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
                />
                Processing...
              </>
            ) : (
              <>
                {allAnswered ? 'Get Classification' : 'Continue'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={onSkip}
            disabled={isLoading}
            className="gap-2 text-slate-400 hover:text-white hover:bg-slate-700/50 h-12 rounded-xl"
          >
            <SkipForward className="w-4 h-4" />
            Skip & Get Best Guess
          </Button>

          {/* Progress indicator */}
          <div className="hidden sm:flex items-center gap-3 ml-auto">
            <div className="flex gap-1.5">
              {[1, 2, 3].map((round) => (
                <div
                  key={round}
                  className={cn(
                    'w-2.5 h-2.5 rounded-full transition-all duration-300',
                    round < roundNumber
                      ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                      : round === roundNumber
                      ? 'bg-cyan-500 shadow-lg shadow-cyan-500/50 animate-pulse'
                      : 'bg-slate-700'
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {Object.keys(answers).length} of {questions.length} answered
            </span>
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
          <span>Click any selected option again to deselect it</span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

'use client'

import { useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { History } from 'lucide-react'
import { useWizard, WizardScreen } from '@/lib/hooks/use-wizard'
import { useHistory } from '@/lib/hooks/use-history'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { InputScreen } from './input-screen'
import { QuestionScreen } from './question-screen'
import { ResultScreen } from './result-screen'
import { LoadingScreen } from './loading-screen'
import { ErrorScreen, LegacyErrorScreen } from './error-screen'

// ============================================================================
// Animation Variants
// ============================================================================

// Full animation variants for users who haven't set reduced motion
const fullScreenVariants = {
  initial: (direction: number) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0,
  }),
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      x: { type: 'spring' as const, stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 100 : -100,
    opacity: 0,
    transition: {
      x: { type: 'spring' as const, stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
    },
  }),
}

// Reduced motion variants - simple fade only
const reducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

// ============================================================================
// Component
// ============================================================================

export function WizardContainer() {
  const wizard = useWizard()
  const { history, addToHistory } = useHistory()
  const shouldReduceMotion = useReducedMotion()

  // Track if we've already saved this classification to prevent duplicates
  const savedConversationIdRef = useRef<string | null>(null)
  // Track when classification started for processing time calculation
  const classificationStartTimeRef = useRef<number>(Date.now())

  // Reset start time when a new classification begins
  useEffect(() => {
    if (wizard.screen === 'loading' && wizard.selections.length === 0) {
      classificationStartTimeRef.current = Date.now()
    }
  }, [wizard.screen, wizard.selections.length])

  // Auto-save to history when classification completes
  useEffect(() => {
    if (
      wizard.screen === 'result' &&
      wizard.result &&
      wizard.conversationId &&
      savedConversationIdRef.current !== wizard.conversationId
    ) {
      // Mark as saved to prevent duplicate saves
      savedConversationIdRef.current = wizard.conversationId

      const endTime = Date.now()
      const processingTimeMs = endTime - classificationStartTimeRef.current

      // Save to history with full session details
      addToHistory({
        conversationId: wizard.conversationId,
        productDescription: wizard.product,
        hsCode: wizard.result.code,
        description: wizard.result.description,
        confidence: wizard.result.confidence,
        reasoning: wizard.result.reasoning,
        alternatives: wizard.result.alternatives,
        sessionDetails: {
          questions: wizard.selections.map((s, i) => ({
            questionText: s.questionText,
            answerLabel: s.answerLabel,
            answerCode: s.answerCode,
            questionNumber: i + 1,
          })),
          totalQuestions: wizard.selections.length,
          processingTimeMs,
          startTime: classificationStartTimeRef.current,
          endTime,
        },
      })

      console.log('[WIZARD] Classification saved to history:', {
        conversationId: wizard.conversationId,
        hsCode: wizard.result.code,
        questions: wizard.selections.length,
        processingTimeMs,
      })
    }
  }, [wizard.screen, wizard.result, wizard.conversationId, wizard.product, wizard.selections, addToHistory])

  // Reset saved conversation ID when starting a new classification
  useEffect(() => {
    if (wizard.screen === 'input') {
      savedConversationIdRef.current = null
    }
  }, [wizard.screen])

  // Track direction for animations (1 = forward, -1 = backward)
  // We use forward for all transitions except goBack
  const direction = 1

  // Select variants based on user's motion preference
  const screenVariants = shouldReduceMotion ? reducedMotionVariants : fullScreenVariants

  // Handle going back - would set direction to -1 in a more complex implementation
  const handleGoBack = useCallback(() => {
    wizard.goBack()
  }, [wizard])

  // Render the appropriate screen
  const renderScreen = () => {
    switch (wizard.screen) {
      case 'input':
        return (
          <InputScreen
            onSubmit={wizard.startClassification}
            isLoading={wizard.isLoading}
          />
        )

      case 'loading':
        return (
          <LoadingScreen
            product={wizard.product}
          />
        )

      case 'question':
        if (!wizard.currentQuestion) return null
        return (
          <QuestionScreen
            product={wizard.product}
            question={wizard.currentQuestion}
            onSelectOption={wizard.selectOption}
            onGoBack={handleGoBack}
            selections={wizard.selections}
            progress={wizard.progress}
            isLoading={wizard.isLoading}
          />
        )

      case 'result':
        if (!wizard.result) return null
        return (
          <ResultScreen
            result={wizard.result}
            product={wizard.product}
            selections={wizard.selections}
            conversationId={wizard.conversationId}
            onClassifyAnother={wizard.reset}
          />
        )

      case 'error':
        // Use new ErrorScreen if we have structured error, fallback to legacy
        if (wizard.error && typeof wizard.error === 'object') {
          return (
            <ErrorScreen
              error={wizard.error}
              onRetry={wizard.retry}
              onStartOver={wizard.reset}
              onEditInput={wizard.error.type === 'classification' ? wizard.reset : undefined}
            />
          )
        }
        // Fallback for legacy string errors (shouldn't happen but just in case)
        return (
          <LegacyErrorScreen
            message={String(wizard.error) || 'Something went wrong'}
            onRetry={wizard.retry}
            onStartOver={wizard.reset}
          />
        )

      default:
        return null
    }
  }

  return (
    <div
      className="relative min-h-screen flex flex-col bg-white dark:bg-slate-900 transition-colors duration-300"
      style={{
        // Mobile safe areas for notched devices
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Header actions - top right (with safe area offset) */}
      <div
        className="absolute z-20 flex items-center gap-2"
        style={{
          top: 'max(1rem, env(safe-area-inset-top))',
          right: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {/* History Link */}
        <Link
          href="/history"
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="View Classification History"
        >
          <History className="w-5 h-5" />
          {history.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-cyan-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {history.length > 9 ? '9+' : history.length}
            </span>
          )}
        </Link>

        <ThemeToggle />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={wizard.screen}
            custom={direction}
            variants={screenVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 flex flex-col"
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ============================================================================
// Screen Key Helper
// ============================================================================

// Get a unique key for the current screen state
// This ensures animations trigger correctly
export function getScreenKey(screen: WizardScreen, questionIndex?: number): string {
  if (screen === 'question' && questionIndex !== undefined) {
    return `question-${questionIndex}`
  }
  return screen
}

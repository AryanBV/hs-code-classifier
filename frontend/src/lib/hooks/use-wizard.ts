'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { getSessionId } from '@/lib/api-client'
import { parseError, type ClassificationError } from '@/lib/types/errors'

// ============================================================================
// Types
// ============================================================================

export type WizardScreen = 'input' | 'loading' | 'question' | 'result' | 'error'

export interface QuestionOption {
  label: string
  code?: string
}

export interface CurrentQuestion {
  id: string      // Question ID from API (needed for answers)
  text: string
  options: QuestionOption[]
  rawOptions: string[]  // Original option strings for API response
  index: number   // Current question number (1-based)
  total: number   // Total expected questions (estimated)
}

export interface Selection {
  questionText: string
  answerLabel: string
  answerCode: string
  optionIndex: number
}

export interface AlternativeCode {
  code: string
  description: string
  confidence?: number
  reason?: string
}

export interface ClassificationResult {
  code: string
  description: string
  confidence: number
  reasoning?: string
  alternatives?: AlternativeCode[]
}

export interface WizardState {
  screen: WizardScreen
  product: string
  conversationId: string | null
  currentQuestion: CurrentQuestion | null
  selections: Selection[]
  result: ClassificationResult | null
  error: ClassificationError | null
}

// ============================================================================
// API Types (matching actual backend response)
// ============================================================================

interface ApiQuestionItem {
  id: string
  text: string
  options: string[] // Format: "CODE::Label text"
  allowOther?: boolean
  priority?: string
}

interface ApiQuestionData {
  code: string
  label: string
  description: string
}

interface ApiQuestionsResponse {
  success: boolean
  responseType: 'questions'
  conversationId: string
  questions: ApiQuestionItem[]
  _questionData?: ApiQuestionData[]
  timestamp: string
}

interface ApiClassificationResponse {
  success: boolean
  responseType: 'classification'
  conversationId: string
  result: {
    hsCode: string
    description: string
    confidence: number
    reasoning?: string
    alternatives?: Array<{
      code: string
      description: string
      confidence?: number
      reason?: string
    }>
  }
  timestamp: string
}

type ApiResponse = ApiQuestionsResponse | ApiClassificationResponse

// Helper to parse "CODE::Label" format into { code, label }
function parseOptionString(optionStr: string): { code: string; label: string } {
  const parts = optionStr.split('::')
  if (parts.length >= 2) {
    return { code: parts[0] || '', label: parts.slice(1).join('::') }
  }
  return { code: '', label: optionStr }
}

// ============================================================================
// Constants
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const MAX_QUESTIONS = 5 // Estimate for progress bar

// ============================================================================
// Initial State
// ============================================================================

const initialState: WizardState = {
  screen: 'input',
  product: '',
  conversationId: null,
  currentQuestion: null,
  selections: [],
  result: null,
  error: null,
}

// ============================================================================
// Hook
// ============================================================================

export function useWizard() {
  const [state, setState] = useState<WizardState>(initialState)

  // Ref to prevent stale closure issues with conversationId
  const conversationIdRef = useRef<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    conversationIdRef.current = state.conversationId
  }, [state.conversationId])

  // ---------------------------------------------------------------------------
  // API Call Helper
  // ---------------------------------------------------------------------------

  const callApi = useCallback(async (body: Record<string, unknown>): Promise<ApiResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/classify-conversational`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || errorData.error || `API error: ${response.status}`)
    }

    return response.json()
  }, [])

  // ---------------------------------------------------------------------------
  // Action: Start Classification
  // ---------------------------------------------------------------------------

  const startClassification = useCallback(async (productDescription: string) => {
    if (!productDescription.trim() || productDescription.trim().length < 3) {
      return
    }

    // Set loading state
    setState(prev => ({
      ...prev,
      screen: 'loading',
      product: productDescription.trim(),
      error: null,
      selections: [],
      result: null,
      currentQuestion: null,
      conversationId: null,
    }))

    try {
      const sessionId = getSessionId()
      const response = await callApi({
        productDescription: productDescription.trim(),
        sessionId,
      })

      if (!response.success) {
        throw new Error('Classification failed')
      }

      if (response.responseType === 'questions') {
        // Got questions - show question screen
        // Parse the first question from the questions array
        const firstQuestion = response.questions[0]
        if (!firstQuestion) {
          throw new Error('No questions received from API')
        }
        const parsedOptions = firstQuestion.options.map(parseOptionString)

        setState(prev => ({
          ...prev,
          screen: 'question',
          conversationId: response.conversationId,
          currentQuestion: {
            id: firstQuestion.id,
            text: firstQuestion.text,
            options: parsedOptions,
            rawOptions: firstQuestion.options,
            index: 1,
            total: MAX_QUESTIONS,
          },
        }))
      } else if (response.responseType === 'classification') {
        // Direct classification (no questions needed)
        setState(prev => ({
          ...prev,
          screen: 'result',
          conversationId: response.conversationId,
          result: {
            code: response.result.hsCode,
            description: response.result.description,
            confidence: response.result.confidence,
            reasoning: response.result.reasoning,
            alternatives: response.result.alternatives,
          },
        }))
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        screen: 'error',
        error: parseError(error, productDescription.trim()),
      }))
    }
  }, [callApi])

  // ---------------------------------------------------------------------------
  // Action: Select Option (Answer Question)
  // ---------------------------------------------------------------------------

  const selectOption = useCallback(async (optionIndex: number) => {
    const currentConversationId = conversationIdRef.current

    if (!currentConversationId || !state.currentQuestion) {
      return
    }

    const selectedOption = state.currentQuestion.options[optionIndex]
    if (!selectedOption) {
      return
    }

    // Store the selection before updating state
    const newSelection: Selection = {
      questionText: state.currentQuestion.text,
      answerLabel: selectedOption.label,
      answerCode: selectedOption.code || '',
      optionIndex,
    }
    const currentQuestionIndex = state.currentQuestion.index

    // Set loading state while keeping current question visible
    setState(prev => ({
      ...prev,
      screen: 'loading',
      selections: [...prev.selections, newSelection],
    }))

    try {
      const sessionId = getSessionId()
      // Get the question ID and raw option string for the backend
      const questionId = state.currentQuestion.id
      const rawOptionValue = state.currentQuestion.rawOptions[optionIndex]

      const response = await callApi({
        productDescription: state.product,
        sessionId,
        conversationId: currentConversationId,
        answers: {
          [questionId]: rawOptionValue
        },
      })

      console.log('[WIZARD] selectOption response:', {
        success: response.success,
        responseType: response.responseType,
        hasResult: response.responseType === 'classification',
      })

      if (!response.success) {
        // Use actual error message from API response
        const errorMsg = (response as any).error || 'Failed to process selection'
        throw new Error(errorMsg)
      }

      if (response.responseType === 'questions') {
        // More questions - parse the first question from the questions array
        const firstQuestion = response.questions[0]
        if (!firstQuestion) {
          throw new Error('No questions received from API')
        }
        const parsedOptions = firstQuestion.options.map(parseOptionString)

        setState(prev => ({
          ...prev,
          screen: 'question',
          currentQuestion: {
            id: firstQuestion.id,
            text: firstQuestion.text,
            options: parsedOptions,
            rawOptions: firstQuestion.options,
            index: currentQuestionIndex + 1,
            total: Math.max(prev.currentQuestion?.total || MAX_QUESTIONS, currentQuestionIndex + 1),
          },
        }))
      } else if (response.responseType === 'classification') {
        // Got final result
        console.log('[WIZARD] Classification received! Setting result screen with:', {
          hsCode: response.result.hsCode,
          confidence: response.result.confidence,
          alternatives: response.result.alternatives,
        })
        setState(prev => ({
          ...prev,
          screen: 'result',
          result: {
            code: response.result.hsCode,
            description: response.result.description,
            confidence: response.result.confidence,
            reasoning: response.result.reasoning,
            alternatives: response.result.alternatives,
          },
          currentQuestion: null,
        }))
        console.log('[WIZARD] State updated to result screen')
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        screen: 'error',
        error: parseError(error, state.product),
      }))
    }
  }, [state.currentQuestion, state.product, callApi])

  // ---------------------------------------------------------------------------
  // Action: Go Back
  // ---------------------------------------------------------------------------

  const goBack = useCallback(() => {
    if (state.selections.length === 0) {
      // Go back to input
      setState(prev => ({
        ...prev,
        screen: 'input',
        conversationId: null,
        currentQuestion: null,
        error: null,
      }))
    } else {
      // For now, go back to input since we can't easily revert API state
      // In a more complex implementation, we'd need to restart the conversation
      // or maintain a history stack on the backend
      setState(prev => ({
        ...prev,
        screen: 'input',
        conversationId: null,
        currentQuestion: null,
        selections: [],
        error: null,
      }))
    }
  }, [state.selections.length])

  // ---------------------------------------------------------------------------
  // Action: Reset (Start Over)
  // ---------------------------------------------------------------------------

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  // ---------------------------------------------------------------------------
  // Action: Retry (After Error)
  // ---------------------------------------------------------------------------

  const retry = useCallback(() => {
    if (state.product) {
      startClassification(state.product)
    } else {
      reset()
    }
  }, [state.product, startClassification, reset])

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const isLoading = state.screen === 'loading'
  const hasStarted = state.screen !== 'input'
  const canGoBack = state.screen === 'question' || state.screen === 'error'

  // Progress calculation (for question screen)
  const progress = state.currentQuestion
    ? {
        current: state.currentQuestion.index,
        total: state.currentQuestion.total,
        percentage: Math.round((state.currentQuestion.index / state.currentQuestion.total) * 100),
      }
    : null

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    ...state,

    // Derived
    isLoading,
    hasStarted,
    canGoBack,
    progress,

    // Actions
    startClassification,
    selectOption,
    goBack,
    reset,
    retry,
  }
}

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  classifyConversational,
  skipToClassification,
  abandonConversation,
  getSessionId,
  ClarifyingQuestion,
  ConversationalResult,
  ConversationSummary
} from '@/lib/api-client'

export type ConversationStatus =
  | 'idle'
  | 'loading'
  | 'asking'
  | 'answering'
  | 'completed'
  | 'error'

export interface ConversationHistoryItem {
  type: 'question' | 'answer'
  content: string
  answer?: string
}

export interface ConversationState {
  status: ConversationStatus
  conversationId: string | null
  productDescription: string
  currentQuestions: ClarifyingQuestion[] | null
  questionContext: string | null
  roundNumber: number
  totalQuestionsAsked: number
  history: ConversationHistoryItem[]
  result: ConversationalResult | null
  summary: ConversationSummary | null
  error: string | null
}

const initialState: ConversationState = {
  status: 'idle',
  conversationId: null,
  productDescription: '',
  currentQuestions: null,
  questionContext: null,
  roundNumber: 0,
  totalQuestionsAsked: 0,
  history: [],
  result: null,
  summary: null,
  error: null
}

export function useConversation() {
  const [state, setState] = useState<ConversationState>(initialState)

  // Use ref to prevent stale closure issues with conversationId
  const conversationIdRef = useRef<string | null>(null)

  // Keep the ref in sync with state
  useEffect(() => {
    conversationIdRef.current = state.conversationId
  }, [state.conversationId])

  /**
   * Start a new classification conversation
   */
  const startClassification = useCallback(async (productDescription: string) => {
    setState(() => ({
      ...initialState,
      status: 'loading' as ConversationStatus,
      productDescription
    }))

    try {
      const sessionId = getSessionId()
      const response = await classifyConversational({
        productDescription,
        sessionId
      })

      if (!response.success) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: response.error || 'Classification failed'
        }))
        return
      }

      if (response.responseType === 'questions' && response.questions) {
        setState(prev => ({
          ...prev,
          status: 'asking',
          conversationId: response.conversationId,
          currentQuestions: response.questions || null,
          questionContext: response.questionContext || null,
          roundNumber: response.roundNumber ?? 1,
          totalQuestionsAsked: response.totalQuestionsAsked || 0
        }))
      } else if (response.responseType === 'classification' && response.result) {
        setState(prev => ({
          ...prev,
          status: 'completed',
          conversationId: response.conversationId,
          result: response.result || null,
          summary: response.conversationSummary || null,
          currentQuestions: null
        }))
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }))
    }
  }, [])

  /**
   * Submit answers to current questions
   */
  const submitAnswers = useCallback(async (answers: Record<string, string>) => {
    // Use ref for conversationId to prevent stale closure issues
    const currentConversationId = conversationIdRef.current
    if (!currentConversationId || !state.currentQuestions) return

    // Add Q&A to history
    const newHistoryItems: ConversationHistoryItem[] = []
    for (const question of state.currentQuestions) {
      newHistoryItems.push({
        type: 'question',
        content: question.text
      })
      const answer = answers[question.id]
      if (answer) {
        const answerText = answer.startsWith('other:')
          ? answer.replace('other:', '')
          : answer
        newHistoryItems.push({
          type: 'answer',
          content: answerText
        })
      }
    }

    setState(prev => ({
      ...prev,
      status: 'loading',
      history: [...prev.history, ...newHistoryItems]
    }))

    try {
      const sessionId = getSessionId()
      // Use ref value for conversationId to avoid stale closure
      const response = await classifyConversational({
        productDescription: state.productDescription,
        conversationId: currentConversationId,
        sessionId,
        answers
      })

      if (!response.success) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: response.error || 'Failed to process answers'
        }))
        return
      }

      if (response.responseType === 'questions' && response.questions) {
        setState(prev => ({
          ...prev,
          status: 'asking',
          currentQuestions: response.questions || null,
          questionContext: response.questionContext || null,
          roundNumber: response.roundNumber ?? (prev.roundNumber + 1),
          totalQuestionsAsked: response.totalQuestionsAsked || prev.totalQuestionsAsked
        }))
      } else if (response.responseType === 'classification' && response.result) {
        setState(prev => ({
          ...prev,
          status: 'completed',
          result: response.result || null,
          summary: response.conversationSummary || null,
          currentQuestions: null
        }))
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }))
    }
  }, [state.currentQuestions, state.productDescription]) // Removed conversationId - using ref instead

  /**
   * Skip remaining questions and get best guess
   */
  const skip = useCallback(async () => {
    // Use ref for conversationId to prevent stale closure issues
    const currentConversationId = conversationIdRef.current
    if (!currentConversationId) return

    setState(prev => ({ ...prev, status: 'loading' }))

    try {
      const sessionId = getSessionId()
      const response = await skipToClassification(currentConversationId, sessionId)

      if (!response.success) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: response.error || 'Failed to skip'
        }))
        return
      }

      if (response.result) {
        setState(prev => ({
          ...prev,
          status: 'completed',
          result: response.result || null,
          summary: response.conversationSummary || null,
          currentQuestions: null
        }))
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }))
    }
  }, []) // Removed conversationId - using ref instead

  /**
   * Reset and start over
   */
  const reset = useCallback(async () => {
    // Abandon current conversation if exists
    if (state.conversationId && state.status !== 'completed') {
      try {
        await abandonConversation(state.conversationId)
      } catch {
        // Ignore errors when abandoning
      }
    }

    setState(initialState)
  }, [state.conversationId, state.status])

  return {
    ...state,
    startClassification,
    submitAnswers,
    skip,
    reset,
    isLoading: state.status === 'loading',
    isAskingQuestions: state.status === 'asking',
    isCompleted: state.status === 'completed',
    hasError: state.status === 'error'
  }
}

'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navbar } from '@/components/layout/navbar'
import { ChatContainer, WelcomeMessage, ConversationDivider } from '@/components/classify/chat-container'
import { ChatMessage, QuestionOptions } from '@/components/classify/chat-message'
import { ChatInput } from '@/components/classify/chat-input'
import { ResultCard } from '@/components/classify/result-card'
import { LoadingState } from '@/components/classify/loading-state'
import { HistorySidebar } from '@/components/history/history-sidebar'
import { HistorySheet } from '@/components/history/history-sheet'
import { HistoryDetailView } from '@/components/history/history-detail-view'
import { useHistory, HistoryItem } from '@/lib/hooks/use-history'
import { useConversation } from '@/lib/hooks/use-conversation'
import { Button } from '@/components/ui/button'
import { RotateCcw, Sparkles } from 'lucide-react'

/**
 * Parse answer string to extract friendly label
 * Format: "CODE::FRIENDLY_LABEL" or plain text
 */
function parseAnswerLabel(answer: string): string {
  if (answer.includes('::')) {
    const [, label] = answer.split('::')
    return label?.trim() || answer
  }
  if (answer.includes(':')) {
    const colonIndex = answer.indexOf(':')
    return answer.substring(colonIndex + 1).trim()
  }
  return answer
}

interface ClassificationResult {
  hsCode: string
  description: string
  confidence: number
  reasoning: string
  alternatives?: Array<{ code: string; description: string; confidence?: number }>
  clarificationImpact?: string
}

interface QuestionData {
  id: string
  text: string
  options: string[]
  priority?: string
}

interface ChatMessageItem {
  id: string
  type: 'ai' | 'user' | 'system' | 'questions'
  content: string | React.ReactNode
  timestamp: Date
  questionId?: string
  options?: string[]
  // For question messages - store data, not JSX
  questionData?: {
    context: string
    questions: QuestionData[]
    roundNumber: number
  }
}

export default function ClassifyPage() {
  const [productDescription, setProductDescription] = useState('')
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>()
  const [historySheetOpen, setHistorySheetOpen] = useState(false)
  const [processingStartTime, setProcessingStartTime] = useState<number | undefined>()
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([])
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string>>({})
  const [viewingHistoryResult, setViewingHistoryResult] = useState<HistoryItem | null>(null)

  // History hook for sidebar
  const {
    history,
    addToHistory,
    clearHistory,
    formatTimestamp,
  } = useHistory()

  // Conversation hook for conversational classification
  const conversation = useConversation()

  // Handle starting a new classification
  const handleClassify = useCallback(async () => {
    if (!productDescription.trim() || productDescription.trim().length < 3) return

    // Clear any history view
    setViewingHistoryResult(null)
    setActiveHistoryId(undefined)
    setProcessingStartTime(Date.now())
    setPendingAnswers({})

    // Add user message to chat
    setChatMessages([{
      id: `user-${Date.now()}`,
      type: 'user',
      content: productDescription.trim(),
      timestamp: new Date()
    }])

    await conversation.startClassification(productDescription.trim())
  }, [productDescription, conversation])

  // Handle answer selection
  const handleSelectAnswer = useCallback((questionId: string, answer: string) => {
    setPendingAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }))
  }, [])

  // Handle submitting answers
  const handleSubmitAnswers = useCallback(async () => {
    if (Object.keys(pendingAnswers).length === 0) return

    // Add user answers to chat
    Object.entries(pendingAnswers).forEach(([, answer]) => {
      setChatMessages(prev => [
        ...prev,
        {
          id: `user-answer-${Date.now()}-${Math.random()}`,
          type: 'user',
          content: answer,
          timestamp: new Date()
        }
      ])
    })

    await conversation.submitAnswers(pendingAnswers)
    setPendingAnswers({})
  }, [pendingAnswers, conversation])

  // Handle skipping questions
  const handleSkip = useCallback(async () => {
    setChatMessages(prev => [
      ...prev,
      {
        id: `system-skip-${Date.now()}`,
        type: 'system',
        content: 'Skipped to best guess',
        timestamp: new Date()
      }
    ])
    await conversation.skip()
  }, [conversation])

  // Handle selecting a history item - show the result directly
  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
    // Reset conversation state
    conversation.reset()
    setChatMessages([])
    setPendingAnswers({})
    setProductDescription('')
    setProcessingStartTime(undefined)

    // Set the history item to view
    setViewingHistoryResult(item)
    setActiveHistoryId(item.id)
    setHistorySheetOpen(false)
  }, [conversation])

  // Handle starting a new classification
  const handleNewClassification = useCallback(() => {
    conversation.reset()
    setChatMessages([])
    setPendingAnswers({})
    setProductDescription('')
    setActiveHistoryId(undefined)
    setProcessingStartTime(undefined)
    setViewingHistoryResult(null)
  }, [conversation])

  // Add AI questions to chat when they arrive
  // Store question DATA, not JSX, so selection state updates properly
  useEffect(() => {
    if (conversation.isAskingQuestions && conversation.currentQuestions) {
      const questionContext = conversation.questionContext || 'To classify your product accurately, I need to know:'

      // Add AI question message with DATA (not JSX)
      setChatMessages(prev => {
        // Check if we already added this round's questions
        const searchId = `ai-questions-round${conversation.roundNumber}`
        const existingQuestion = prev.find(m => m.id.startsWith(searchId))

        // Debug logging for conversation continuation
        if (process.env.NODE_ENV === 'development') {
          console.log('[Dedup Check]', {
            roundNumber: conversation.roundNumber,
            searchingFor: searchId,
            found: !!existingQuestion,
            existingIds: prev.filter(m => m.id.startsWith('ai-questions')).map(m => m.id)
          })
        }

        if (existingQuestion) return prev

        return [
          ...prev,
          {
            id: `ai-questions-round${conversation.roundNumber}-${Date.now()}`,
            type: 'questions', // Special type for question messages
            content: '', // Not used - we render from questionData
            timestamp: new Date(),
            questionData: {
              context: questionContext,
              questions: (conversation.currentQuestions || []).map(q => ({
                id: q.id,
                text: q.text,
                options: q.options,
                priority: q.priority
              })),
              roundNumber: conversation.roundNumber
            }
          }
        ]
      })
    }
  }, [conversation.isAskingQuestions, conversation.currentQuestions, conversation.roundNumber, conversation.questionContext])

  // When classification completes, add to history with full context
  useEffect(() => {
    if (conversation.isCompleted && conversation.result && !activeHistoryId && !viewingHistoryResult) {
      const historyItem = addToHistory({
        productDescription: conversation.productDescription,
        hsCode: conversation.result.hsCode,
        description: conversation.result.description,
        confidence: conversation.result.confidence,
        reasoning: conversation.result.reasoning,
        // Enhanced fields for full classification context
        alternatives: conversation.result.alternatives,
        clarificationImpact: conversation.result.clarificationImpact,
        processingTimeMs: processingStartTime ? Date.now() - processingStartTime : undefined,
        totalRounds: conversation.roundNumber,
        questionsAsked: conversation.roundNumber > 1 ? conversation.roundNumber - 1 : 0,
      })
      setActiveHistoryId(historyItem.id)
    }
  }, [conversation.isCompleted, conversation.result, conversation.productDescription, activeHistoryId, viewingHistoryResult, addToHistory, processingStartTime, conversation.roundNumber])

  // Calculate processing time
  const processingTime = conversation.isCompleted && processingStartTime
    ? Date.now() - processingStartTime
    : undefined

  // Determine what to show
  const showLoading = conversation.isLoading && !conversation.isAskingQuestions
  const showQuestions = conversation.isAskingQuestions && conversation.currentQuestions
  const showResult = conversation.isCompleted || viewingHistoryResult
  const hasStarted = chatMessages.length > 0 || conversation.isLoading || viewingHistoryResult

  // Build result object - either from conversation or from history
  const resultToShow: ClassificationResult | null = conversation.result
    ? {
        hsCode: conversation.result.hsCode,
        description: conversation.result.description,
        confidence: conversation.result.confidence,
        reasoning: conversation.result.reasoning,
        alternatives: conversation.result.alternatives,
        clarificationImpact: conversation.result.clarificationImpact,
      }
    : viewingHistoryResult
    ? {
        hsCode: viewingHistoryResult.hsCode,
        description: viewingHistoryResult.description,
        confidence: viewingHistoryResult.confidence,
        reasoning: viewingHistoryResult.reasoning,
      }
    : null

  // Check if we have pending answers to submit
  const hasPendingAnswers = Object.keys(pendingAnswers).length > 0

  // Should show input bar - only before classification starts
  const showInputBar = !hasStarted

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Navbar />

      {/* Main layout - fills remaining height */}
      <div className="flex-1 flex min-h-0">
        {/* Chat area - flex column with proper height constraints */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Mobile header - fixed height */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border md:hidden shrink-0">
            <h1 className="text-lg font-semibold text-foreground">Classify</h1>
            <div className="flex items-center gap-2">
              <HistorySheet
                history={history}
                formatTimestamp={formatTimestamp}
                onSelectItem={handleSelectHistoryItem}
                onClearHistory={clearHistory}
                activeItemId={activeHistoryId}
                open={historySheetOpen}
                onOpenChange={setHistorySheetOpen}
              />
            </div>
          </div>

          {/* Error message - fixed height when shown */}
          <AnimatePresence>
            {conversation.hasError && conversation.error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-4 mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between shrink-0"
              >
                <span>{conversation.error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewClassification}
                  className="text-destructive hover:text-destructive/80"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Try Again
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat container - takes remaining space, scrolls internally */}
          <ChatContainer
            className="flex-1 min-h-0 px-4 md:px-8 lg:px-12"
            centerContent={!hasStarted}
          >
            {!hasStarted ? (
              <WelcomeMessage />
            ) : viewingHistoryResult ? (
              // Show history result with full classification details
              <>
                <ConversationDivider text="Classification History" />

                <HistoryDetailView
                  item={{
                    id: viewingHistoryResult.id,
                    productDescription: viewingHistoryResult.productDescription,
                    hsCode: viewingHistoryResult.hsCode,
                    description: viewingHistoryResult.description,
                    confidence: viewingHistoryResult.confidence,
                    reasoning: viewingHistoryResult.reasoning,
                    timestamp: viewingHistoryResult.timestamp,
                    alternatives: viewingHistoryResult.alternatives,
                    clarificationImpact: viewingHistoryResult.clarificationImpact,
                    processingTimeMs: viewingHistoryResult.processingTimeMs,
                    totalRounds: viewingHistoryResult.totalRounds,
                    questionsAsked: viewingHistoryResult.questionsAsked,
                  }}
                />

                {/* New classification button */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex justify-center py-6"
                >
                  <Button
                    onClick={handleNewClassification}
                    variant="outline"
                    className="border-border hover:border-primary/50 hover:bg-muted/50"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    New Classification
                  </Button>
                </motion.div>
              </>
            ) : (
              <>
                {/* Chat messages */}
                {chatMessages.map((message) => {
                  // Special handling for question messages - render with live pendingAnswers state
                  if (message.type === 'questions' && message.questionData) {
                    const { context, questions } = message.questionData
                    return (
                      <ChatMessage
                        key={message.id}
                        type="ai"
                        timestamp={message.timestamp}
                      >
                        <div className="space-y-4">
                          <p className="text-muted-foreground">{context}</p>
                          {questions.map((q, idx) => (
                            <div key={q.id} className="space-y-2">
                              <p className="font-medium text-foreground">
                                {idx + 1}. {q.text}
                                {q.priority === 'required' && <span className="text-primary ml-1">*</span>}
                              </p>
                              <QuestionOptions
                                options={q.options}
                                selectedOption={pendingAnswers[q.id]}
                                onSelect={(answer) => handleSelectAnswer(q.id, answer)}
                                disabled={conversation.isLoading}
                              />
                            </div>
                          ))}
                        </div>
                      </ChatMessage>
                    )
                  }

                  // Regular messages
                  return (
                    <ChatMessage
                      key={message.id}
                      type={message.type as 'ai' | 'user' | 'system'}
                      timestamp={message.timestamp}
                    >
                      {/* Parse user answer to show friendly label instead of CODE::LABEL */}
                      {message.type === 'user' && typeof message.content === 'string'
                        ? parseAnswerLabel(message.content)
                        : message.content}
                    </ChatMessage>
                  )
                })}

                {/* Loading state */}
                {showLoading && (
                  <div className="py-8">
                    <LoadingState />
                  </div>
                )}

                {/* Submit answers button */}
                {showQuestions && hasPendingAnswers && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center gap-3 py-4"
                  >
                    <Button
                      onClick={handleSubmitAnswers}
                      disabled={conversation.isLoading}
                      className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-glow text-white"
                    >
                      Continue
                      <Sparkles className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleSkip}
                      disabled={conversation.isLoading}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Skip & Get Best Guess
                    </Button>
                  </motion.div>
                )}

                {/* Result */}
                {showResult && resultToShow && !viewingHistoryResult && (
                  <>
                    <ConversationDivider text="Classification Complete" />

                    {/* Clarification impact message */}
                    {resultToShow.clarificationImpact && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start gap-3 px-4 py-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                      >
                        <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-emerald-300">{resultToShow.clarificationImpact}</p>
                      </motion.div>
                    )}

                    <ResultCard
                      result={resultToShow}
                      classificationId={conversation.conversationId || activeHistoryId || ''}
                      productDescription={conversation.productDescription || productDescription}
                      processingTime={processingTime}
                    />

                    {/* New classification button */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="flex justify-center py-6"
                    >
                      <Button
                        onClick={handleNewClassification}
                        variant="outline"
                        className="border-border hover:border-primary/50 hover:bg-muted/50"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        New Classification
                      </Button>
                    </motion.div>
                  </>
                )}
              </>
            )}
          </ChatContainer>

          {/* Input area - fixed at bottom, only show before classification starts */}
          {showInputBar && (
            <div className="border-t border-border bg-background/80 backdrop-blur-xl p-4 md:px-8 lg:px-12 shrink-0">
              <div className="max-w-3xl mx-auto">
                <ChatInput
                  value={productDescription}
                  onChange={setProductDescription}
                  onSubmit={handleClassify}
                  isLoading={conversation.isLoading}
                  disabled={false}
                  showExamples={true}
                  autoFocus={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar - fixed width, independent scroll */}
        <aside className="hidden lg:flex lg:flex-col w-72 xl:w-80 border-l border-border bg-card/30 shrink-0">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-3">
              <HistorySidebar
                history={history}
                formatTimestamp={formatTimestamp}
                onSelectItem={handleSelectHistoryItem}
                onClearHistory={clearHistory}
                activeItemId={activeHistoryId}
                compact
                initialVisibleCount={10}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

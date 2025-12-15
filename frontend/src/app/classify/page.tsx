'use client'

import { useState, useCallback } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { ProductInput } from '@/components/classify/product-input'
import { LoadingState } from '@/components/classify/loading-state'
import { ResultCard } from '@/components/classify/result-card'
import { PerformanceStats } from '@/components/classify/performance-stats'
import { ClarifyingQuestions } from '@/components/classify/clarifying-questions'
import { ConversationHistory, ConversationSummaryInline } from '@/components/classify/conversation-history'
import { HistorySidebar } from '@/components/history/history-sidebar'
import { HistorySheet } from '@/components/history/history-sheet'
import { useHistory, HistoryItem } from '@/lib/hooks/use-history'
import { useConversation } from '@/lib/hooks/use-conversation'
import { RotateCcw, Sparkles } from 'lucide-react'

interface ClassificationResult {
  hsCode: string
  description: string
  confidence: number
  reasoning: string
}

export default function ClassifyPage() {
  const [productDescription, setProductDescription] = useState('')
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>()
  const [historySheetOpen, setHistorySheetOpen] = useState(false)
  const [processingStartTime, setProcessingStartTime] = useState<number | undefined>()

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
    if (!productDescription.trim() || productDescription.length < 10) return

    setActiveHistoryId(undefined)
    setProcessingStartTime(Date.now())

    await conversation.startClassification(productDescription.trim())
  }, [productDescription, conversation])

  // Handle submitting answers to clarifying questions
  const handleSubmitAnswers = useCallback(async (answers: Record<string, string>) => {
    await conversation.submitAnswers(answers)
  }, [conversation])

  // Handle skipping questions
  const handleSkip = useCallback(async () => {
    await conversation.skip()
  }, [conversation])

  // Handle selecting a history item
  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
    // Reset conversation state
    conversation.reset()

    // Show the historical result
    setProductDescription(item.productDescription)
    setActiveHistoryId(item.id)
  }, [conversation])

  // Handle starting a new classification
  const handleNewClassification = useCallback(() => {
    conversation.reset()
    setProductDescription('')
    setActiveHistoryId(undefined)
    setProcessingStartTime(undefined)
  }, [conversation])

  // When classification completes, add to history
  const handleClassificationComplete = useCallback(() => {
    if (conversation.result) {
      const historyItem = addToHistory({
        productDescription: conversation.productDescription,
        hsCode: conversation.result.hsCode,
        description: conversation.result.description,
        confidence: conversation.result.confidence,
        reasoning: conversation.result.reasoning,
      })
      setActiveHistoryId(historyItem.id)
    }
  }, [conversation.result, conversation.productDescription, addToHistory])

  // Add to history when result is available
  if (conversation.isCompleted && conversation.result && !activeHistoryId) {
    handleClassificationComplete()
  }

  // Calculate processing time
  const processingTime = conversation.isCompleted && processingStartTime
    ? Date.now() - processingStartTime
    : undefined

  // Convert conversation history to display format
  const displayHistory = conversation.history

  // Get historical result if viewing from history
  const historicalResult = activeHistoryId
    ? history.find(h => h.id === activeHistoryId)
    : null

  // Determine what to show
  const showLoading = conversation.isLoading
  const showQuestions = conversation.isAskingQuestions && conversation.currentQuestions
  const showResult = conversation.isCompleted || historicalResult

  // Build result object
  const resultToShow: ClassificationResult | null = conversation.result
    ? {
        hsCode: conversation.result.hsCode,
        description: conversation.result.description,
        confidence: conversation.result.confidence,
        reasoning: conversation.result.reasoning,
      }
    : historicalResult
    ? {
        hsCode: historicalResult.hsCode,
        description: historicalResult.description,
        confidence: historicalResult.confidence,
        reasoning: historicalResult.reasoning,
      }
    : null

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <div className="container py-6 md:py-8">
          <div className="flex gap-6 lg:gap-8">
            {/* Main content area */}
            <div className="flex-1 min-w-0">
              {/* Page header */}
              <div className="flex items-center justify-between mb-6 md:mb-8">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold mb-1">
                    Classify Your Product
                  </h1>
                  <p className="text-muted-foreground">
                    {showQuestions
                      ? 'Answer a few questions for accurate classification'
                      : 'Describe your product to get the HS code'}
                  </p>
                </div>

                {/* Mobile history button */}
                <div className="relative md:hidden">
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

              {/* Error message */}
              {conversation.hasError && conversation.error && (
                <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
                  <span>{conversation.error}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNewClassification}
                    className="text-destructive hover:text-destructive"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Try Again
                  </Button>
                </div>
              )}

              {/* Main content */}
              <div className="space-y-6">
                {/* Show conversation history when asking questions */}
                {showQuestions && displayHistory.length > 0 && (
                  <ConversationHistory items={displayHistory} />
                )}

                {showLoading ? (
                  <LoadingState />
                ) : showQuestions && conversation.currentQuestions ? (
                  <ClarifyingQuestions
                    questions={conversation.currentQuestions}
                    context={conversation.questionContext || ''}
                    roundNumber={conversation.roundNumber}
                    totalQuestionsAsked={conversation.totalQuestionsAsked}
                    onSubmit={handleSubmitAnswers}
                    onSkip={handleSkip}
                    isLoading={conversation.isLoading}
                  />
                ) : showResult && resultToShow ? (
                  <>
                    {/* Show clarification summary if it was a conversational flow */}
                    {conversation.summary && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span>Enhanced by clarifying questions</span>
                        <span className="text-muted-foreground/60">|</span>
                        <ConversationSummaryInline
                          questionsAsked={conversation.summary.questionsAsked}
                          answersProvided={conversation.summary.answersProvided}
                          totalRounds={conversation.summary.totalRounds}
                          durationMs={conversation.summary.durationMs}
                        />
                      </div>
                    )}

                    {/* Clarification impact message */}
                    {conversation.result?.clarificationImpact && (
                      <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm mb-4">
                        {conversation.result.clarificationImpact}
                      </div>
                    )}

                    <ResultCard
                      result={resultToShow}
                      classificationId={conversation.conversationId || activeHistoryId || ''}
                      productDescription={conversation.productDescription || productDescription}
                    />

                    {processingTime && (
                      <PerformanceStats processingTime={processingTime} />
                    )}

                    <Button
                      onClick={handleNewClassification}
                      variant="outline"
                      size="lg"
                      className="w-full"
                    >
                      New Classification
                    </Button>
                  </>
                ) : (
                  <ProductInput
                    value={productDescription}
                    onChange={setProductDescription}
                    onSubmit={handleClassify}
                    isLoading={conversation.isLoading}
                  />
                )}
              </div>
            </div>

            {/* Desktop sidebar */}
            <div className="hidden md:block w-72 lg:w-80 flex-shrink-0">
              <div className="sticky top-20 bg-card border border-border rounded-2xl p-4 max-h-[calc(100vh-6rem)] overflow-hidden">
                <HistorySidebar
                  history={history}
                  formatTimestamp={formatTimestamp}
                  onSelectItem={handleSelectHistoryItem}
                  onClearHistory={clearHistory}
                  activeItemId={activeHistoryId}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

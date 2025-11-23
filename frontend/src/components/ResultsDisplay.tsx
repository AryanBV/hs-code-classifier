"use client"

import { useState } from "react"
import { CheckCircle2, XCircle, HelpCircle, ChevronDown, ChevronUp } from "lucide-react"

/**
 * Props for ResultsDisplay component
 */
interface ResultsDisplayProps {
  result: ClassificationResult
  onReset: () => void
}

/**
 * Classification result structure
 */
interface ClassificationResult {
  success: boolean
  results?: HsCodeResult[]
  classificationId?: string
  error?: string
  message?: string
}

/**
 * Individual HS code result
 */
interface HsCodeResult {
  hsCode: string
  description: string
  confidence: number
  reasoning: string
  countryMapping?: {
    india: string
    destination?: string
    destinationCountry?: string
    importDuty?: string
    specialRequirements?: string
  }
}

/**
 * Mobile-first results display component
 *
 * Features:
 * - Collapsible reasoning section (saves screen space on mobile)
 * - Collapsible alternatives (progressive disclosure)
 * - Responsive grid layouts
 * - Touch-friendly feedback buttons
 * - Error and empty states
 *
 * Mobile optimizations:
 * - Vertical stack on mobile
 * - Collapsible sections by default
 * - Full-width buttons
 * - Touch-friendly targets (44px+)
 */
export function ResultsDisplay({ result, onReset }: ResultsDisplayProps) {
  const [showReasoning, setShowReasoning] = useState(true)
  const [showAlternatives, setShowAlternatives] = useState(false)

  /**
   * Handle user feedback
   * TODO: Implement API submission in Phase 3
   */
  const handleFeedback = async (feedback: 'correct' | 'incorrect' | 'unsure') => {
    console.log('Feedback:', feedback)
    // TODO: Call API to submit feedback
  }

  /**
   * Get confidence badge color based on percentage
   */
  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-800 border-green-300'
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-red-100 text-red-800 border-red-300'
  }

  // Error state - Mobile optimized
  if (!result.success) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-card border border-destructive rounded-lg p-4 sm:p-6 md:p-8">
          <div className="flex items-start gap-3 mb-4">
            <XCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h2 className="text-lg sm:text-xl font-semibold text-destructive mb-2">
                Classification Failed
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {result.error || result.message || 'An error occurred during classification'}
              </p>
            </div>
          </div>
          <button
            onClick={onReset}
            className="w-full sm:w-auto min-h-[44px] px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // No results state - Mobile optimized
  if (!result.results || result.results.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-card border rounded-lg p-4 sm:p-6 md:p-8 text-center">
          <HelpCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg sm:text-xl font-semibold mb-2">
            No Results Found
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-6">
            {result.message || 'Unable to classify with sufficient confidence. Please provide more details.'}
          </p>
          <button
            onClick={onReset}
            className="w-full sm:w-auto min-h-[44px] px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
          >
            New Classification
          </button>
        </div>
      </div>
    )
  }

  const topResult = result.results[0]!
  const alternatives = result.results.slice(1)

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Result - Mobile Optimized */}
      <div className="bg-card border rounded-lg p-4 sm:p-6 md:p-8">
        {/* Header with Code and Confidence */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 font-mono">
              {topResult.hsCode}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              {topResult.description}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-md border font-semibold whitespace-nowrap self-start ${getConfidenceBadgeColor(topResult.confidence)}`}>
            {topResult.confidence}% Confident
          </div>
        </div>

        {/* Reasoning - Collapsible on Mobile */}
        <div className="mt-4 sm:mt-6">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center justify-between w-full text-left mb-2 hover:text-primary transition-colors"
          >
            <h3 className="text-sm font-semibold">Why this code?</h3>
            {showReasoning ? (
              <ChevronUp className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            )}
          </button>
          {showReasoning && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {topResult.reasoning}
            </p>
          )}
        </div>

        {/* Country Mapping - Mobile Optimized Grid */}
        {topResult.countryMapping && (
          <div className="mt-4 sm:mt-6 p-4 bg-muted/50 rounded-md">
            <h3 className="text-sm font-semibold mb-3">Country Mapping</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between sm:block">
                <span className="text-muted-foreground">India HS Code:</span>
                <span className="ml-2 font-mono font-semibold">{topResult.countryMapping.india}</span>
              </div>
              {topResult.countryMapping.destination && (
                <div className="flex justify-between sm:block">
                  <span className="text-muted-foreground">{topResult.countryMapping.destinationCountry} Code:</span>
                  <span className="ml-2 font-mono font-semibold">{topResult.countryMapping.destination}</span>
                </div>
              )}
              {topResult.countryMapping.importDuty && (
                <div className="flex justify-between sm:block">
                  <span className="text-muted-foreground">Import Duty:</span>
                  <span className="ml-2 font-semibold">{topResult.countryMapping.importDuty}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Buttons - Mobile Stack */}
        <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <button
            onClick={() => handleFeedback('correct')}
            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 border border-green-300 text-green-700 rounded-md hover:bg-green-50 transition-colors font-medium"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Correct</span>
          </button>
          <button
            onClick={() => handleFeedback('incorrect')}
            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors font-medium"
          >
            <XCircle className="h-4 w-4" />
            <span>Incorrect</span>
          </button>
          <button
            onClick={() => handleFeedback('unsure')}
            className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 border rounded-md hover:bg-accent transition-colors font-medium"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Unsure</span>
          </button>
        </div>
      </div>

      {/* Alternative Results - Collapsible */}
      {alternatives.length > 0 && (
        <div className="bg-card border rounded-lg p-4 sm:p-6">
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="flex items-center justify-between w-full text-left mb-4 hover:text-primary transition-colors"
          >
            <h3 className="text-base sm:text-lg font-semibold">
              Alternative Codes ({alternatives.length})
            </h3>
            {showAlternatives ? (
              <ChevronUp className="h-5 w-5 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 flex-shrink-0" />
            )}
          </button>

          {showAlternatives && (
            <div className="space-y-3 sm:space-y-4">
              {alternatives.map((alt, index) => (
                <div key={index} className="p-3 sm:p-4 border rounded-md">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <h4 className="font-mono font-semibold text-base">{alt.hsCode}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{alt.description}</p>
                    </div>
                    <div className={`px-3 py-1 rounded text-sm border whitespace-nowrap self-start ${getConfidenceBadgeColor(alt.confidence)}`}>
                      {alt.confidence}%
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {alt.reasoning}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions - Mobile Optimized */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
        <button
          onClick={onReset}
          className="w-full sm:w-auto min-h-[44px] px-8 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
        >
          New Classification
        </button>
      </div>

      {/* Classification ID */}
      {result.classificationId && (
        <p className="text-center text-xs text-muted-foreground">
          ID: {result.classificationId}
        </p>
      )}
    </div>
  )
}

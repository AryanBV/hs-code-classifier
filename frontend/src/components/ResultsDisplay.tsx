"use client"

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
 * Display classification results
 *
 * Shows:
 * - Top HS code with confidence badge
 * - Reasoning explanation
 * - Country mapping
 * - Alternative codes (2nd, 3rd options)
 * - Feedback buttons
 *
 * TODO: Implement in Phase 2
 * - Add PDF export button
 * - Add feedback submission
 * - Add "Copy to clipboard" for HS code
 * - Add visual confidence indicators
 */
export function ResultsDisplay({ result, onReset }: ResultsDisplayProps) {
  /**
   * Handle user feedback
   * TODO: Implement in Phase 2
   */
  const handleFeedback = (feedback: 'correct' | 'incorrect' | 'unsure') => {
    console.log('Feedback:', feedback)
    // TODO: Call API to submit feedback
  }

  /**
   * Get confidence badge color
   */
  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-800 border-green-300'
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-red-100 text-red-800 border-red-300'
  }

  // Error state
  if (!result.success) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-card border border-destructive rounded-lg p-6 md:p-8">
          <h2 className="text-xl font-semibold text-destructive mb-4">
            Classification Failed
          </h2>
          <p className="text-muted-foreground mb-6">
            {result.error || result.message || 'An error occurred during classification'}
          </p>
          <button
            onClick={onReset}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // No results state
  if (!result.results || result.results.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-card border rounded-lg p-6 md:p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">
            No Results Found
          </h2>
          <p className="text-muted-foreground mb-6">
            {result.message || 'Unable to classify with sufficient confidence. Please provide more details.'}
          </p>
          <button
            onClick={onReset}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
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
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Top Result */}
      <div className="bg-card border rounded-lg p-6 md:p-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">
              {topResult.hsCode}
            </h2>
            <p className="text-muted-foreground">
              {topResult.description}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-md border font-semibold ${getConfidenceBadgeColor(topResult.confidence)}`}>
            {topResult.confidence}% Confident
          </div>
        </div>

        {/* Reasoning */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-2">Why this code?</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {topResult.reasoning}
          </p>
        </div>

        {/* Country Mapping */}
        {topResult.countryMapping && (
          <div className="mt-6 p-4 bg-muted/50 rounded-md">
            <h3 className="text-sm font-semibold mb-3">Country Mapping</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">India HS Code:</span>
                <span className="ml-2 font-mono font-semibold">{topResult.countryMapping.india}</span>
              </div>
              {topResult.countryMapping.destination && (
                <div>
                  <span className="text-muted-foreground">{topResult.countryMapping.destinationCountry} Code:</span>
                  <span className="ml-2 font-mono font-semibold">{topResult.countryMapping.destination}</span>
                </div>
              )}
              {topResult.countryMapping.importDuty && (
                <div>
                  <span className="text-muted-foreground">Import Duty:</span>
                  <span className="ml-2 font-semibold">{topResult.countryMapping.importDuty}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => handleFeedback('correct')}
            className="flex-1 px-4 py-2 border border-green-300 text-green-700 rounded-md hover:bg-green-50 transition-colors"
          >
            ✓ Correct
          </button>
          <button
            onClick={() => handleFeedback('incorrect')}
            className="flex-1 px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors"
          >
            ✗ Incorrect
          </button>
          <button
            onClick={() => handleFeedback('unsure')}
            className="flex-1 px-4 py-2 border rounded-md hover:bg-accent transition-colors"
          >
            ? Unsure
          </button>
        </div>
      </div>

      {/* Alternative Results */}
      {alternatives.length > 0 && (
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Alternative Codes</h3>
          <div className="space-y-4">
            {alternatives.map((alt, index) => (
              <div key={index} className="p-4 border rounded-md">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-mono font-semibold">{alt.hsCode}</h4>
                    <p className="text-sm text-muted-foreground">{alt.description}</p>
                  </div>
                  <div className={`px-3 py-1 rounded text-sm border ${getConfidenceBadgeColor(alt.confidence)}`}>
                    {alt.confidence}%
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {alt.reasoning}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <button
          onClick={onReset}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          New Classification
        </button>
        {/* TODO: Add PDF export button in Phase 2 */}
      </div>

      {/* Classification ID (for debugging) */}
      {result.classificationId && (
        <p className="text-center text-xs text-muted-foreground">
          Classification ID: {result.classificationId}
        </p>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { ClassificationForm } from "@/components/ClassificationForm"
import { ResultsDisplay } from "@/components/ResultsDisplay"
import { classifyProduct, ApiError } from "@/lib/api-client"
import { AlertCircle } from "lucide-react"

/**
 * Home page - Main classification interface
 *
 * Mobile-first responsive design with:
 * - Responsive typography (3xl mobile → 5xl desktop)
 * - Responsive spacing (py-6 mobile → py-12 desktop)
 * - Single column mobile → 3 column grid on tablet+
 * - Connected to backend API for real classifications
 *
 * Flow:
 * 1. User fills out classification form
 * 2. Form submits to backend API (localhost:3001)
 * 3. Results displayed with confidence scores and reasoning
 */
export default function HomePage() {
  const [classificationResult, setClassificationResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Handle form submission - Uses API client with error handling
   */
  const handleClassify = async (formData: any) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await classifyProduct({
        productDescription: formData.productDescription,
        destinationCountry: formData.destinationCountry || 'IN',
      })

      setClassificationResult(result)
    } catch (err) {
      console.error('Classification error:', err)

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred. Please try again.')
      }

      // Show error in results display
      setClassificationResult({
        success: false,
        error: err instanceof ApiError ? err.message : 'Classification failed',
      })
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Reset to start new classification
   */
  const handleReset = () => {
    setClassificationResult(null)
    setError(null)
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-12">
      {/* Error Banner - Mobile Optimized */}
      {error && !classificationResult && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                {error}
              </p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-destructive hover:text-destructive/80"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Hero Section - Mobile Optimized */}
      <div className="max-w-4xl mx-auto text-center mb-8 md:mb-12">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3 md:mb-4">
          AI-Powered HS Code Classification
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground mb-2">
          Reduce classification time from 30 minutes to 2 minutes
        </p>
        <p className="text-sm text-muted-foreground">
          85%+ accuracy • Transparent reasoning • Country-specific mapping
        </p>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto">
        {!classificationResult ? (
          <ClassificationForm
            onSubmit={handleClassify}
            isLoading={isLoading}
          />
        ) : (
          <ResultsDisplay
            result={classificationResult}
            onReset={handleReset}
          />
        )}
      </div>

      {/* Features Section - Mobile Grid */}
      {!classificationResult && (
        <div className="max-w-5xl mx-auto mt-12 md:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <div className="text-2xl md:text-3xl font-bold text-primary mb-2">30%</div>
            <div className="text-sm font-medium mb-1">Keyword Matching</div>
            <div className="text-xs text-muted-foreground">
              PostgreSQL full-text search
            </div>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <div className="text-2xl md:text-3xl font-bold text-primary mb-2">40%</div>
            <div className="text-sm font-medium mb-1">Decision Trees</div>
            <div className="text-xs text-muted-foreground">
              Rule-based classification
            </div>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <div className="text-2xl md:text-3xl font-bold text-primary mb-2">30%</div>
            <div className="text-sm font-medium mb-1">AI Reasoning</div>
            <div className="text-xs text-muted-foreground">
              OpenAI GPT-4o-mini powered
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

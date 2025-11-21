"use client"

import { useState } from "react"
import { ClassificationForm } from "@/components/ClassificationForm"
import { ResultsDisplay } from "@/components/ResultsDisplay"

/**
 * Home page - Main classification interface
 *
 * Flow:
 * 1. User fills out classification form
 * 2. Form submits to backend API
 * 3. Results displayed with confidence scores
 */
export default function HomePage() {
  const [classificationResult, setClassificationResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Handle form submission
   * TODO: Implement in Phase 2
   */
  const handleClassify = async (formData: any) => {
    setIsLoading(true)

    try {
      // TODO: Call API client to classify product
      // const result = await classifyProduct(formData)
      // setClassificationResult(result)

      console.log('Classification requested:', formData)

      // Placeholder result
      setClassificationResult({
        success: true,
        results: [],
        message: 'Classification will be implemented in Phase 2'
      })
    } catch (error) {
      console.error('Classification error:', error)
      setClassificationResult({
        success: false,
        error: 'Classification failed'
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
  }

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          AI-Powered HS Code Classification
        </h1>
        <p className="text-xl text-muted-foreground mb-2">
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

      {/* Features Section */}
      {!classificationResult && (
        <div className="max-w-5xl mx-auto mt-16 grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">30%</div>
            <div className="text-sm font-medium mb-1">Keyword Matching</div>
            <div className="text-xs text-muted-foreground">
              PostgreSQL full-text search
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">40%</div>
            <div className="text-sm font-medium mb-1">Decision Trees</div>
            <div className="text-xs text-muted-foreground">
              Rule-based classification
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">30%</div>
            <div className="text-sm font-medium mb-1">AI Reasoning</div>
            <div className="text-xs text-muted-foreground">
              OpenAI GPT-4o powered
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

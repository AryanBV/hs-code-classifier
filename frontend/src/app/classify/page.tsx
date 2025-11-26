"use client"

import { useState } from "react"
import Link from "next/link"
import { ClassificationForm } from "@/components/ClassificationForm"
import { ResultsDisplay } from "@/components/ResultsDisplay"
import { classifyProduct, ApiError, getSessionId } from "@/lib/api-client"
import { AlertCircle, ArrowLeft } from "lucide-react"

/**
 * Classify Page - Dedicated product classification interface
 *
 * Provides focused classification experience with:
 * - Clear heading explaining the purpose
 * - ClassificationForm for product details input
 * - Full classification via backend API on form submit
 * - ResultsDisplay showing top 5 matching codes
 * - Navigation back to home
 * - Classification history tracking with localStorage
 */
export default function ClassifyPage() {
  const [classificationResult, setClassificationResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClassify = async (formData: any) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await classifyProduct({
        productDescription: formData.productDescription,
        destinationCountry: formData.destinationCountry || 'IN',
      })

      // Track classification in history
      if (typeof window !== 'undefined') {
        const historyKey = `hs_classification_history_${getSessionId()}`
        const existingHistory = JSON.parse(localStorage.getItem(historyKey) || '[]')
        existingHistory.unshift({
          ...result,
          timestamp: new Date().toISOString(),
          input: formData.productDescription,
        })
        localStorage.setItem(historyKey, JSON.stringify(existingHistory.slice(0, 50)))
      }

      setClassificationResult(result)
    } catch (err) {
      console.error('Classification error:', err)

      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred. Please try again.')
      }

      setClassificationResult({
        success: false,
        error: err instanceof ApiError ? err.message : 'Classification failed',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setClassificationResult(null)
    setError(null)
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-12">
      {/* Back Navigation */}
      <Link href="/">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 md:mb-8 cursor-pointer">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </div>
      </Link>

      {/* Error Banner */}
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

      {/* Page Header */}
      <div className="max-w-4xl mx-auto text-center mb-8 md:mb-12">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3 md:mb-4">
          Classify Your Product
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground">
          Describe your product and get instant HS code recommendations
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

    </div>
  )
}

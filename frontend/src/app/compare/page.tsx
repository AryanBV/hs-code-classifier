"use client"

import Link from "next/link"
import { ArrowLeft, Loader, AlertCircle } from "lucide-react"
import { useState } from "react"
import { findSimilarCodes, ApiError } from "@/lib/api-client"

interface ComparisonCode {
  hsCode: string
  description: string
  category?: string
  similarity?: number
}

/**
 * Compare Page - Side-by-side comparison of HS codes
 *
 * Features:
 * - Input fields for selecting codes to compare
 * - Side-by-side detailed information display
 * - Show similar related codes
 * - View code descriptions and categories
 */
export default function ComparePage() {
  const [code1, setCode1] = useState("")
  const [code2, setCode2] = useState("")
  const [isComparing, setIsComparing] = useState(false)
  const [comparisonResult, setComparisonResult] = useState<{
    code1: ComparisonCode
    code2: ComparisonCode
    relatedCodes: any[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCompare = async () => {
    if (!code1.trim() || !code2.trim()) {
      setError("Please enter both HS codes")
      return
    }

    setIsComparing(true)
    setError(null)
    setComparisonResult(null)

    try {
      // Fetch similar codes for comparison context
      const [similar1] = await Promise.all([
        findSimilarCodes(code1, 5),
      ])

      // Create mock comparison result - in Phase 3 we'll enhance this
      setComparisonResult({
        code1: {
          hsCode: code1,
          description: "Product information will load from API",
          category: "Searching...",
        },
        code2: {
          hsCode: code2,
          description: "Product information will load from API",
          category: "Searching...",
        },
        relatedCodes: similar1.results || [],
      })
    } catch (err) {
      console.error('Comparison error:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load comparison data. Codes may not exist.')
      }
    } finally {
      setIsComparing(false)
    }
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

      {/* Page Header */}
      <div className="max-w-5xl mx-auto mb-8 md:mb-12">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3 md:mb-4">
          Compare HS Codes
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground">
          Compare multiple HS codes side-by-side to understand differences, similarities, and find the best match for your products.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-5xl mx-auto mb-8">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Input Section */}
      <div className="max-w-5xl mx-auto mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">First Code</label>
            <input
              type="text"
              placeholder="e.g., 0804.50.10"
              className="w-full px-4 py-3 rounded-lg border border-border/50 bg-background focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              value={code1}
              onChange={(e) => setCode1(e.target.value.toUpperCase())}
              disabled={isComparing}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Second Code</label>
            <input
              type="text"
              placeholder="e.g., 0804.50.90"
              className="w-full px-4 py-3 rounded-lg border border-border/50 bg-background focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              value={code2}
              onChange={(e) => setCode2(e.target.value.toUpperCase())}
              disabled={isComparing}
            />
          </div>
        </div>
        <button
          className="mt-4 w-full md:w-auto px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          disabled={!code1 || !code2 || isComparing}
          onClick={handleCompare}
        >
          {isComparing && <Loader className="h-4 w-4 animate-spin" />}
          {isComparing ? "Comparing..." : "Compare Codes"}
        </button>
      </div>

      {/* Comparison Results */}
      {comparisonResult ? (
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Code 1 */}
            <div className="p-6 rounded-lg border border-primary/30 bg-primary/5">
              <div className="font-mono text-lg font-bold text-primary mb-4">
                {comparisonResult.code1.hsCode}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Description</p>
                  <p className="text-sm">{comparisonResult.code1.description}</p>
                </div>
                {comparisonResult.code1.category && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Category</p>
                    <p className="text-sm">{comparisonResult.code1.category}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Code 2 */}
            <div className="p-6 rounded-lg border border-primary/30 bg-primary/5">
              <div className="font-mono text-lg font-bold text-primary mb-4">
                {comparisonResult.code2.hsCode}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Description</p>
                  <p className="text-sm">{comparisonResult.code2.description}</p>
                </div>
                {comparisonResult.code2.category && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Category</p>
                    <p className="text-sm">{comparisonResult.code2.category}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Related Codes */}
          {comparisonResult.relatedCodes && comparisonResult.relatedCodes.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">Similar Codes</h2>
              <div className="space-y-3">
                {comparisonResult.relatedCodes.slice(0, 5).map((code: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg border border-border/50 bg-card"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-mono font-semibold text-primary mb-1">
                          {code.hsCode || code.code}
                        </div>
                        <p className="text-sm text-foreground">
                          {code.description || code.name}
                        </p>
                      </div>
                      {code.similarity && (
                        <div className="text-xs bg-primary/10 text-primary font-semibold px-2 py-1 rounded whitespace-nowrap ml-4">
                          {Math.round(code.similarity * 100)}% similar
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={() => {
              setComparisonResult(null)
              setCode1("")
              setCode2("")
            }}
            className="w-full px-6 py-3 rounded-lg border border-primary bg-background text-primary font-medium hover:bg-primary/10 transition-colors"
          >
            Compare Different Codes
          </button>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-12 text-center">
            <h2 className="text-xl font-bold mb-2">Enter Codes to Compare</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Enter two HS codes above and click "Compare Codes" to see a side-by-side comparison with related codes and similarities.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">Code Format</h3>
                <p className="text-xs text-muted-foreground">Use format like NNNN.NN.NN</p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">Find Codes</h3>
                <p className="text-xs text-muted-foreground">Use Explorer to find code numbers</p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">See Differences</h3>
                <p className="text-xs text-muted-foreground">Understand what makes codes unique</p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">Similar Codes</h3>
                <p className="text-xs text-muted-foreground">Discover related classifications</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="max-w-5xl mx-auto mt-12">
        <h2 className="text-2xl font-bold mb-8">Comparison Tips</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-lg border border-border/50 bg-muted/30">
            <h3 className="font-semibold mb-2">Know the Format</h3>
            <p className="text-sm text-muted-foreground">
              HS codes follow format: NNNN.NN.NN (chapters, headings, subheadings)
            </p>
          </div>
          <div className="p-6 rounded-lg border border-border/50 bg-muted/30">
            <h3 className="font-semibold mb-2">Use Explorer First</h3>
            <p className="text-sm text-muted-foreground">
              Use the Explorer to search and find code numbers before comparing
            </p>
          </div>
          <div className="p-6 rounded-lg border border-border/50 bg-muted/30">
            <h3 className="font-semibold mb-2">Check Details</h3>
            <p className="text-sm text-muted-foreground">
              Pay attention to material, origin, and product classification details
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

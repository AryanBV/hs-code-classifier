"use client"

import Link from "next/link"
import { ArrowLeft, Trash2, Copy } from "lucide-react"
import { useState, useEffect } from "react"
import { getSessionId } from "@/lib/api-client"

interface HistoryItem {
  results?: any[]
  timestamp: string
  input: string
  classificationId?: string
}

/**
 * History Page - View past classifications
 *
 * Features:
 * - Display classification history from localStorage
 * - Show product description and results
 * - Copy results to clipboard
 * - Clear history option
 * - Chronological ordering (newest first)
 */
export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    try {
      if (typeof window !== 'undefined') {
        const historyKey = `hs_classification_history_${getSessionId()}`
        const stored = localStorage.getItem(historyKey)
        if (stored) {
          setHistory(JSON.parse(stored))
        }
      }
    } catch (error) {
      console.error('Error loading history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearHistory = () => {
    if (typeof window !== 'undefined' && confirm('Are you sure? This cannot be undone.')) {
      const historyKey = `hs_classification_history_${getSessionId()}`
      localStorage.removeItem(historyKey)
      setHistory([])
    }
  }

  const copyToClipboard = (item: HistoryItem) => {
    const text = `Product: ${item.input}\n\nTop Match: ${item.results?.[0]?.hsCode || 'N/A'}\nDescription: ${item.results?.[0]?.description || 'N/A'}`
    navigator.clipboard.writeText(text)
    setCopied(item.timestamp)
    setTimeout(() => setCopied(null), 2000)
  }

  const formatDate = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return 'Invalid date'
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-2">
              Classification History
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground">
              View your past HS code classifications
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors font-medium text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* History List */}
      <div className="max-w-5xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-12 text-center">
            <h2 className="text-xl font-bold mb-2">No Classification History</h2>
            <p className="text-muted-foreground mb-6">
              Your classifications will appear here after you classify products.
            </p>
            <Link href="/classify">
              <button className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                Start Classifying
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item, idx) => (
              <div
                key={idx}
                className="p-4 sm:p-6 rounded-lg border border-border/50 bg-card hover:border-primary/50 transition-all"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                      {formatDate(item.timestamp)}
                    </p>
                    <p className="text-sm font-medium line-clamp-2">
                      {item.input}
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(item)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/50 hover:bg-accent transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    <Copy className="h-4 w-4" />
                    {copied === item.timestamp ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Result */}
                {item.results && item.results.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="text-sm font-mono font-semibold text-primary">
                          {item.results[0].hsCode}
                        </div>
                        <p className="text-sm text-foreground mt-1">
                          {item.results[0].description}
                        </p>
                      </div>
                      <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-semibold whitespace-nowrap">
                        {item.results[0].confidence}%
                      </div>
                    </div>
                  </div>
                )}

                {/* Other Results Count */}
                {item.results && item.results.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    +{item.results.length - 1} other matching codes
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

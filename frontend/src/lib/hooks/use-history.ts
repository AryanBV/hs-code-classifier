'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface AlternativeCode {
  code: string
  description: string
  confidence?: number
  reason?: string
}

export interface SessionQuestion {
  questionText: string
  answerLabel: string
  answerCode?: string
  questionNumber: number
}

export interface SessionDetails {
  questions: SessionQuestion[]
  totalQuestions: number
  processingTimeMs?: number
  startTime: number
  endTime: number
}

export interface HistoryItem {
  // Identification
  id: string
  conversationId?: string  // Links to backend database

  // Input
  productDescription: string

  // Result
  hsCode: string
  description: string
  confidence: number
  reasoning?: string

  // Session Details
  sessionDetails?: SessionDetails

  // Alternatives
  alternatives?: AlternativeCode[]

  // Metadata
  timestamp: number
  userFeedback?: 'correct' | 'wrong' | 'unsure'

  // Sync status
  syncedToBackend: boolean
  lastSyncAttempt?: number

  // Legacy fields (backwards compatibility)
  clarificationImpact?: string
  processingTimeMs?: number
  totalRounds?: number
  questionsAsked?: number
}

export interface HistoryFilters {
  dateRange?: { start: Date; end: Date }
  confidenceMin?: number
  chapter?: string
  hasUserFeedback?: boolean
  searchQuery?: string
}

export interface HistoryStats {
  total: number
  thisWeek: number
  averageConfidence: number
  mostCommonChapter: string
}

interface UseHistoryReturn {
  // Data
  history: HistoryItem[]
  isLoaded: boolean

  // CRUD Operations
  addToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp' | 'syncedToBackend'>) => HistoryItem
  removeFromHistory: (id: string) => void
  clearHistory: () => void
  getHistoryItem: (id: string) => HistoryItem | undefined
  updateHistoryItem: (id: string, updates: Partial<HistoryItem>) => void

  // Search & Filter
  searchHistory: (query: string) => HistoryItem[]
  filterHistory: (filters: HistoryFilters) => HistoryItem[]

  // Export
  exportToCSV: (ids?: string[]) => Blob
  exportToPDF: (ids?: string[]) => Promise<Blob>

  // Stats
  stats: HistoryStats

  // Utilities
  formatTimestamp: (timestamp: number) => string
  formatFullDate: (timestamp: number) => string

  // State
  isSyncing: boolean
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'tradecode_history'
const MAX_HISTORY_ITEMS = 100

// ============================================================================
// Helper Functions
// ============================================================================

function getWeekStart(): number {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek
  return new Date(now.setDate(diff)).setHours(0, 0, 0, 0)
}

function calculateRelevanceScore(item: HistoryItem, query: string): number {
  const normalizedQuery = query.toLowerCase().trim()
  let score = 0

  // If query looks like an HS code (digits and dots), prioritize code matches
  if (/^[\d.]+$/.test(normalizedQuery)) {
    if (item.hsCode.startsWith(normalizedQuery)) {
      score += 20
    } else if (item.hsCode.includes(normalizedQuery)) {
      score += 10
    }
    return score
  }

  // Exact match in product description (highest weight)
  if (item.productDescription.toLowerCase().includes(normalizedQuery)) {
    score += 10
  }

  // Match in HS code description
  if (item.description.toLowerCase().includes(normalizedQuery)) {
    score += 5
  }

  // Match in reasoning
  if (item.reasoning?.toLowerCase().includes(normalizedQuery)) {
    score += 2
  }

  // Fuzzy match (for individual words)
  const words = normalizedQuery.split(/\s+/)
  words.forEach(word => {
    if (word.length > 2) {
      if (item.productDescription.toLowerCase().includes(word)) {
        score += 1
      }
      if (item.description.toLowerCase().includes(word)) {
        score += 0.5
      }
    }
  })

  return score
}

function getMostCommonChapter(history: HistoryItem[]): string {
  if (history.length === 0) return 'N/A'

  const chapterCounts: Record<string, number> = {}

  history.forEach(item => {
    const chapter = item.hsCode.slice(0, 2)
    chapterCounts[chapter] = (chapterCounts[chapter] || 0) + 1
  })

  const sortedChapters = Object.entries(chapterCounts)
    .sort(([, a], [, b]) => b - a)

  if (sortedChapters.length === 0) return 'N/A'

  const topChapter = sortedChapters[0]
  return topChapter ? `Ch. ${topChapter[0]}` : 'N/A'
}

// ============================================================================
// Hook
// ============================================================================

export function useHistory(): UseHistoryReturn {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isSyncing, _setIsSyncing] = useState(false)

  // ---------------------------------------------------------------------------
  // Load history from localStorage on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Migrate old items to new format
        const migrated = parsed.map((item: Partial<HistoryItem>) => ({
          ...item,
          syncedToBackend: item.syncedToBackend ?? false,
          sessionDetails: item.sessionDetails ?? undefined,
        }))
        setHistory(migrated)
      }
    } catch (error) {
      console.error('Failed to load history:', error)
    }
    setIsLoaded(true)
  }, [])

  // ---------------------------------------------------------------------------
  // Save history to localStorage whenever it changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
      } catch (error) {
        console.error('Failed to save history:', error)
      }
    }
  }, [history, isLoaded])

  // ---------------------------------------------------------------------------
  // Stats Calculation
  // ---------------------------------------------------------------------------

  const stats = useMemo<HistoryStats>(() => {
    const weekStart = getWeekStart()
    const thisWeekItems = history.filter(item => item.timestamp >= weekStart)

    const avgConfidence = history.length > 0
      ? Math.round(history.reduce((sum, item) => sum + item.confidence, 0) / history.length)
      : 0

    return {
      total: history.length,
      thisWeek: thisWeekItems.length,
      averageConfidence: avgConfidence,
      mostCommonChapter: getMostCommonChapter(history),
    }
  }, [history])

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------

  const addToHistory = useCallback((item: Omit<HistoryItem, 'id' | 'timestamp' | 'syncedToBackend'>): HistoryItem => {
    const newItem: HistoryItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      syncedToBackend: false,
    }

    setHistory((prev) => {
      // Check for duplicate (same product description within last minute)
      const oneMinuteAgo = Date.now() - 60000
      const isDuplicate = prev.some(
        h => h.productDescription === item.productDescription && h.timestamp > oneMinuteAgo
      )

      if (isDuplicate) {
        // Update existing instead of adding new
        return prev.map(h =>
          h.productDescription === item.productDescription && h.timestamp > oneMinuteAgo
            ? { ...newItem, id: h.id, timestamp: h.timestamp }
            : h
        )
      }

      // Add new item at the beginning, limit to MAX_HISTORY_ITEMS
      return [newItem, ...prev].slice(0, MAX_HISTORY_ITEMS)
    })

    return newItem
  }, [])

  const removeFromHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const getHistoryItem = useCallback((id: string): HistoryItem | undefined => {
    return history.find(item => item.id === id)
  }, [history])

  const updateHistoryItem = useCallback((id: string, updates: Partial<HistoryItem>) => {
    setHistory(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ))
  }, [])

  // ---------------------------------------------------------------------------
  // Search & Filter
  // ---------------------------------------------------------------------------

  const searchHistory = useCallback((query: string): HistoryItem[] => {
    if (!query.trim()) return history

    const normalizedQuery = query.toLowerCase().trim()

    return history
      .map(item => ({
        item,
        score: calculateRelevanceScore(item, normalizedQuery)
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)
  }, [history])

  const filterHistory = useCallback((filters: HistoryFilters): HistoryItem[] => {
    let result = history

    // Search query
    if (filters.searchQuery?.trim()) {
      result = searchHistory(filters.searchQuery)
    }

    // Date range filter
    if (filters.dateRange) {
      const { start, end } = filters.dateRange
      result = result.filter(item => {
        const itemDate = new Date(item.timestamp)
        return itemDate >= start && itemDate <= end
      })
    }

    // Confidence filter
    if (filters.confidenceMin !== undefined) {
      result = result.filter(item => item.confidence >= filters.confidenceMin!)
    }

    // Chapter filter
    if (filters.chapter) {
      result = result.filter(item => item.hsCode.startsWith(filters.chapter!))
    }

    // Feedback filter
    if (filters.hasUserFeedback !== undefined) {
      result = result.filter(item =>
        filters.hasUserFeedback
          ? item.userFeedback !== undefined
          : item.userFeedback === undefined
      )
    }

    return result
  }, [history, searchHistory])

  // ---------------------------------------------------------------------------
  // Export Functions
  // ---------------------------------------------------------------------------

  const exportToCSV = useCallback((ids?: string[]): Blob => {
    const itemsToExport = ids
      ? history.filter(item => ids.includes(item.id))
      : history

    const headers = [
      'Date',
      'Time',
      'Product Description',
      'HS Code',
      'Description',
      'Confidence (%)',
      'Questions Asked',
      'Processing Time (ms)',
      'Alternative 1',
      'Alternative 2',
      'Alternative 3',
      'User Feedback'
    ]

    const rows = itemsToExport.map(item => {
      const date = new Date(item.timestamp)
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        item.productDescription,
        item.hsCode,
        item.description,
        item.confidence,
        item.sessionDetails?.totalQuestions || item.questionsAsked || 0,
        item.sessionDetails?.processingTimeMs || item.processingTimeMs || '',
        item.alternatives?.[0]?.code || '',
        item.alternatives?.[1]?.code || '',
        item.alternatives?.[2]?.code || '',
        item.userFeedback || ''
      ]
    })

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  }, [history])

  const exportToPDF = useCallback(async (ids?: string[]): Promise<Blob> => {
    // Dynamic import to reduce bundle size
    const { jsPDF } = await import('jspdf')

    const itemsToExport = ids
      ? history.filter(item => ids.includes(item.id))
      : history

    // Create PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })

    // PDF styling constants
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - (margin * 2)
    let yPosition = margin

    // Helper function to add new page if needed
    const checkPageBreak = (requiredSpace: number = 20) => {
      if (yPosition + requiredSpace > pageHeight - margin) {
        doc.addPage()
        yPosition = margin
        return true
      }
      return false
    }

    // Title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('TRADECODE - HS CODE CLASSIFICATION REPORT', margin, yPosition)
    yPosition += 12

    // Subtitle
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition)
    yPosition += 5
    doc.text(`Total Classifications: ${itemsToExport.length}`, margin, yPosition)
    yPosition += 10
    doc.setTextColor(0, 0, 0)

    // Divider line
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 10

    // Each classification
    itemsToExport.forEach((item, index) => {
      checkPageBreak(60) // Ensure space for at least header

      // Classification header
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 102, 204) // Blue
      doc.text(`Classification ${index + 1}`, margin, yPosition)
      yPosition += 7
      doc.setTextColor(0, 0, 0)

      // Product Description
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Product:', margin, yPosition)
      doc.setFont('helvetica', 'normal')
      const productLines = doc.splitTextToSize(item.productDescription, contentWidth - 20)
      doc.text(productLines, margin + 20, yPosition)
      yPosition += productLines.length * 5 + 3

      // HS Code
      checkPageBreak(15)
      doc.setFont('helvetica', 'bold')
      doc.text('HS Code:', margin, yPosition)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 128, 0) // Green
      doc.text(item.hsCode, margin + 20, yPosition)
      doc.setTextColor(0, 0, 0)
      yPosition += 5

      // Code Description
      if (item.description) {
        checkPageBreak(15)
        doc.setFont('helvetica', 'bold')
        doc.text('Description:', margin, yPosition)
        doc.setFont('helvetica', 'normal')
        const descLines = doc.splitTextToSize(item.description, contentWidth - 25)
        doc.text(descLines, margin + 25, yPosition)
        yPosition += descLines.length * 5 + 3
      }

      // Confidence
      checkPageBreak(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Confidence:', margin, yPosition)
      doc.setFont('helvetica', 'normal')
      const confidencePercent = Math.round(item.confidence * 100)
      const confidenceColor: [number, number, number] = confidencePercent >= 90 ? [0, 128, 0] :
                         confidencePercent >= 70 ? [255, 165, 0] : [255, 0, 0]
      doc.setTextColor(...confidenceColor)
      doc.text(`${confidencePercent}%`, margin + 25, yPosition)
      doc.setTextColor(0, 0, 0)
      yPosition += 5

      // Date
      checkPageBreak(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Date:', margin, yPosition)
      doc.setFont('helvetica', 'normal')
      doc.text(new Date(item.timestamp).toLocaleString(), margin + 15, yPosition)
      yPosition += 7

      // Q&A Path (if available)
      if (item.sessionDetails?.questions && item.sessionDetails.questions.length > 0) {
        checkPageBreak(20)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Classification Path:', margin, yPosition)
        yPosition += 5

        item.sessionDetails.questions.forEach((q, qIndex) => {
          checkPageBreak(12)
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(80, 80, 80)

          const answer = q.answerLabel || 'N/A'
          const qaText = `Q${qIndex + 1}: ${q.questionText} → ${answer}`
          const qaLines = doc.splitTextToSize(qaText, contentWidth - 5)
          doc.text(qaLines, margin + 5, yPosition)
          yPosition += qaLines.length * 4 + 2
        })
        doc.setTextColor(0, 0, 0)
      }

      // Alternatives (if available)
      if (item.alternatives && item.alternatives.length > 0) {
        checkPageBreak(15)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Alternative Codes:', margin, yPosition)
        yPosition += 5

        item.alternatives.slice(0, 3).forEach(alt => {
          checkPageBreak(8)
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          const altText = `• ${alt.code}: ${alt.description || ''} (${Math.round((alt.confidence || 0) * 100)}%)`
          const altLines = doc.splitTextToSize(altText, contentWidth - 10)
          doc.text(altLines, margin + 5, yPosition)
          yPosition += altLines.length * 4
        })
      }

      // Reasoning (if available)
      if (item.reasoning) {
        checkPageBreak(20)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Reasoning:', margin, yPosition)
        yPosition += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const reasoningLines = doc.splitTextToSize(item.reasoning, contentWidth - 5)
        reasoningLines.slice(0, 5).forEach((line: string) => {
          checkPageBreak(5)
          doc.text(line, margin + 5, yPosition)
          yPosition += 4
        })
        if (reasoningLines.length > 5) {
          doc.text('...', margin + 5, yPosition)
          yPosition += 4
        }
      }

      // Divider between classifications
      yPosition += 5
      checkPageBreak(5)
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, yPosition, pageWidth - margin, yPosition)
      yPosition += 8
    })

    // Footer disclaimer on last page
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(128, 128, 128)

      // Page number
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 10)

      // Disclaimer only on last page
      if (i === totalPages) {
        const disclaimer = 'DISCLAIMER: This classification is AI-assisted and for reference only. Please verify with official customs authorities before export.'
        const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth)
        doc.text(disclaimerLines, margin, pageHeight - 15)
      }
    }

    // Return as blob
    return doc.output('blob')
  }, [history])

  // ---------------------------------------------------------------------------
  // Formatting Utilities
  // ---------------------------------------------------------------------------

  const formatTimestamp = useCallback((timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp

    // Less than 1 minute
    if (diff < 60 * 1000) {
      return 'Just now'
    }

    // Less than 1 hour
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000))
      return `${minutes}m ago`
    }

    // Less than 24 hours
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000))
      return `${hours}h ago`
    }

    // Less than 7 days
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000))
      return `${days}d ago`
    }

    // Default to date
    return new Date(timestamp).toLocaleDateString()
  }, [])

  const formatFullDate = useCallback((timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    history,
    isLoaded,
    addToHistory,
    removeFromHistory,
    clearHistory,
    getHistoryItem,
    updateHistoryItem,
    searchHistory,
    filterHistory,
    exportToCSV,
    exportToPDF,
    stats,
    formatTimestamp,
    formatFullDate,
    isSyncing,
  }
}

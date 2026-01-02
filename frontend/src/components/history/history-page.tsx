'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Search,
  Filter,
  Download,
  ArrowLeft,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  FileSpreadsheet,
} from 'lucide-react'
import { useHistory, type HistoryFilters } from '@/lib/hooks/use-history'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { HistoryStats } from './history-stats'
import { HistoryCard } from './history-card'
import { HistoryDetailModal } from './history-detail-modal'
import { HistoryEmpty } from './history-empty'
import { HistoryFiltersPanel } from './history-filters'
import { cn } from '@/lib/cn'

// ============================================================================
// Constants
// ============================================================================

const ITEMS_PER_PAGE = 10

// ============================================================================
// Component
// ============================================================================

export function HistoryPage() {
  const {
    history,
    isLoaded,
    stats,
    searchHistory,
    filterHistory,
    removeFromHistory,
    exportToCSV,
    exportToPDF,
    formatTimestamp,
    formatFullDate,
  } = useHistory()

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<HistoryFilters>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // ---------------------------------------------------------------------------
  // Filtered & Paginated Data
  // ---------------------------------------------------------------------------

  const filteredHistory = useMemo(() => {
    if (searchQuery.trim()) {
      return searchHistory(searchQuery)
    }
    if (Object.keys(filters).length > 0) {
      return filterHistory(filters)
    }
    return history
  }, [history, searchQuery, filters, searchHistory, filterHistory])

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE)

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredHistory.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredHistory, currentPage])

  // Reset to page 1 when search/filter changes
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }, [])

  const handleFiltersChange = useCallback((newFilters: HistoryFilters) => {
    setFilters(newFilters)
    setCurrentPage(1)
  }, [])

  // ---------------------------------------------------------------------------
  // Export Handlers
  // ---------------------------------------------------------------------------

  const handleExportCSV = useCallback(() => {
    const blob = exportToCSV(selectedIds.length > 0 ? selectedIds : undefined)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tradecode-history-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }, [exportToCSV, selectedIds])

  const handleExportPDF = useCallback(async () => {
    const blob = await exportToPDF(selectedIds.length > 0 ? selectedIds : undefined)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tradecode-history-${new Date().toISOString().split('T')[0]}.pdf`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }, [exportToPDF, selectedIds])

  // ---------------------------------------------------------------------------
  // Selection Handlers
  // ---------------------------------------------------------------------------

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
  }, [])

  // ---------------------------------------------------------------------------
  // Selected Item for Detail View
  // ---------------------------------------------------------------------------

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    return history.find(item => item.id === selectedItemId) || null
  }, [selectedItemId, history])

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (!isLoaded) {
    return null // Will show loading.tsx
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 transition-colors duration-300">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Back button and title */}
            <div className="flex items-center gap-3">
              <Link
                href="/classify"
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  'text-slate-500 dark:text-slate-400',
                  'hover:bg-slate-100 dark:hover:bg-slate-800',
                  'hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-500" />
                  Classification History
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
                  {history.length} classification{history.length !== 1 ? 's' : ''} saved
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {/* Export Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={history.length === 0}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    history.length === 0
                      ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Export</span>
                </button>

                <AnimatePresence>
                  {showExportMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowExportMenu(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-20"
                      >
                        <button
                          onClick={handleExportCSV}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                          Export to CSV
                        </button>
                        <button
                          onClick={handleExportPDF}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          <FileText className="w-4 h-4 text-red-500" />
                          Export to PDF
                        </button>
                        {selectedIds.length > 0 && (
                          <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
                            {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
                          </div>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  showFilters
                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                <Filter className="w-5 h-5" />
              </button>

              <ThemeToggle />
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-4 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by product description or HS code..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={cn(
                'w-full pl-12 pr-10 py-3 rounded-xl text-sm',
                'bg-slate-100 dark:bg-slate-800',
                'border border-transparent',
                'focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20',
                'text-slate-900 dark:text-white',
                'placeholder-slate-500 dark:placeholder-slate-400',
                'transition-all duration-200'
              )}
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-slate-200 dark:border-slate-700"
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <HistoryFiltersPanel
                filters={filters}
                onFiltersChange={handleFiltersChange}
                history={history}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Dashboard */}
      {history.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <HistoryStats stats={stats} />
        </div>
      )}

      {/* Selection Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"
          >
            <div className="flex items-center justify-between p-3 mb-4 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/30">
              <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300"
              >
                Clear selection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History List */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {history.length === 0 ? (
          <HistoryEmpty />
        ) : filteredHistory.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <Search className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
              No results found
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Try adjusting your search or filters
            </p>
            <button
              onClick={() => {
                handleSearchChange('')
                handleFiltersChange({})
              }}
              className="mt-4 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300"
            >
              Clear all filters
            </button>
          </motion.div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedHistory.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <HistoryCard
                    item={item}
                    formatTimestamp={formatTimestamp}
                    onViewDetails={() => setSelectedItemId(item.id)}
                    onDelete={() => removeFromHistory(item.id)}
                    isSelected={selectedIds.includes(item.id)}
                    onToggleSelect={() => toggleSelection(item.id)}
                  />
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    currentPage === 1
                      ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          'w-10 h-10 rounded-lg text-sm font-medium transition-colors',
                          currentPage === pageNum
                            ? 'bg-cyan-500 text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        )}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    currentPage === totalPages
                      ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedItem && (
          <HistoryDetailModal
            item={selectedItem}
            formatFullDate={formatFullDate}
            onClose={() => setSelectedItemId(null)}
            onDelete={() => {
              removeFromHistory(selectedItem.id)
              setSelectedItemId(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

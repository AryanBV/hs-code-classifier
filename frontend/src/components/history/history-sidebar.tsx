'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Search, X, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HistoryItem } from './history-item'
import { HistoryEmpty } from './history-empty'
import { cn } from '@/lib/cn'
import type { HistoryItem as HistoryItemType } from '@/lib/hooks/use-history'

interface HistorySidebarProps {
  history: HistoryItemType[]
  formatTimestamp: (timestamp: number) => string
  onSelectItem: (item: HistoryItemType) => void
  onClearHistory: () => void
  activeItemId?: string
  compact?: boolean
  initialVisibleCount?: number
}

export function HistorySidebar({
  history,
  formatTimestamp,
  onSelectItem,
  onClearHistory,
  activeItemId,
  compact = false,
  initialVisibleCount = 3,
}: HistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Filter history
  const filteredHistory = useMemo(() => {
    let result = history

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.productDescription.toLowerCase().includes(query) ||
        item.hsCode.toLowerCase().includes(query)
      )
    }

    // Sort by timestamp (newest first)
    result = [...result].sort((a, b) => b.timestamp - a.timestamp)

    return result
  }, [history, searchQuery])

  // Limit visible items when not showing all
  const visibleHistory = showAll || searchQuery
    ? filteredHistory
    : filteredHistory.slice(0, initialVisibleCount)

  const hasMoreItems = filteredHistory.length > initialVisibleCount && !searchQuery

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          {history.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
              {history.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Search toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              'h-7 w-7 p-0 text-muted-foreground hover:text-foreground',
              showSearch && 'bg-muted text-primary'
            )}
          >
            <Search className="h-3.5 w-3.5" />
          </Button>

          {/* Clear history */}
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearHistory}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search input */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-3"
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-7 h-8 bg-muted/50 border-border focus:border-primary text-foreground placeholder-muted-foreground text-xs"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History list */}
      <div className="space-y-2">
        {history.length === 0 ? (
          <HistoryEmpty compact />
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">No results found</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-1 text-xs text-primary hover:text-primary/80"
            >
              Clear search
            </button>
          </div>
        ) : (
          <>
            {visibleHistory.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <HistoryItem
                  item={item}
                  formatTimestamp={formatTimestamp}
                  onClick={() => onSelectItem(item)}
                  isActive={item.id === activeItemId}
                  compact={compact}
                />
              </motion.div>
            ))}

            {/* Show More / Show Less button */}
            {hasMoreItems && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowAll(!showAll)}
                className="w-full flex items-center justify-center gap-1.5 py-2 mt-2 text-xs font-medium text-muted-foreground hover:text-primary bg-muted/30 hover:bg-muted/50 rounded-lg border border-border hover:border-primary/30 transition-all"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Show {filteredHistory.length - initialVisibleCount} More
                  </>
                )}
              </motion.button>
            )}
          </>
        )}
      </div>

      {/* Stats footer */}
      {history.length > 0 && showAll && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pt-3 mt-3 border-t border-border"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{history.length} classification{history.length !== 1 ? 's' : ''}</span>
            <span>
              {new Set(history.map(h => h.hsCode.slice(0, 2))).size} chapter{new Set(history.map(h => h.hsCode.slice(0, 2))).size !== 1 ? 's' : ''}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

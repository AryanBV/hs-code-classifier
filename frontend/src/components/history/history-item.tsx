'use client'

import { cn } from '@/lib/cn'
import type { HistoryItem as HistoryItemType } from '@/lib/hooks/use-history'

interface HistoryItemProps {
  item: HistoryItemType
  formatTimestamp: (timestamp: number) => string
  onClick: () => void
  isActive?: boolean
  compact?: boolean
}

export function HistoryItem({
  item,
  formatTimestamp,
  onClick,
  isActive,
  compact = false,
}: HistoryItemProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-emerald-500'
    if (confidence >= 60) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border transition-all duration-200",
        compact ? "p-2.5" : "p-3",
        isActive
          ? 'bg-primary/10 border-primary/30'
          : 'bg-card/30 border-border hover:bg-card/50 hover:border-primary/20'
      )}
    >
      {/* Product description (truncated) */}
      <p className={cn(
        "font-medium line-clamp-1 text-foreground mb-1.5",
        compact ? "text-xs" : "text-sm"
      )}>
        {item.productDescription}
      </p>

      {/* HS Code and confidence */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          "font-mono text-primary font-semibold",
          compact ? "text-xs" : "text-sm"
        )}>
          {item.hsCode}
        </span>
        <span className={cn(
          "px-1.5 py-0.5 rounded text-white font-medium",
          compact ? "text-[10px]" : "text-xs",
          getConfidenceColor(item.confidence)
        )}>
          {item.confidence}%
        </span>
      </div>

      {/* Timestamp */}
      <p className={cn(
        "text-muted-foreground mt-1",
        compact ? "text-[10px]" : "text-xs"
      )}>
        {formatTimestamp(item.timestamp)}
      </p>
    </button>
  )
}

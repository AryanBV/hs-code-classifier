'use client'

import { Badge } from '@/components/ui/badge'
import type { HistoryItem as HistoryItemType } from '@/lib/hooks/use-history'

interface HistoryItemProps {
  item: HistoryItemType
  formatTimestamp: (timestamp: number) => string
  onClick: () => void
  isActive?: boolean
}

export function HistoryItem({
  item,
  formatTimestamp,
  onClick,
  isActive,
}: HistoryItemProps) {
  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return 'success'
    if (confidence >= 60) return 'warning'
    return 'destructive'
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
        isActive
          ? 'bg-primary/10 border-primary/30'
          : 'bg-card border-border hover:bg-accent hover:border-primary/20'
      }`}
    >
      {/* Product description (truncated) */}
      <p className="text-sm font-medium line-clamp-2 mb-2">
        {item.productDescription}
      </p>

      {/* HS Code and timestamp */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-primary font-semibold">
          {item.hsCode}
        </span>
        <Badge variant={getConfidenceBadge(item.confidence)} className="text-xs">
          {item.confidence}%
        </Badge>
      </div>

      {/* Timestamp */}
      <p className="text-xs text-muted-foreground mt-1">
        {formatTimestamp(item.timestamp)}
      </p>
    </button>
  )
}

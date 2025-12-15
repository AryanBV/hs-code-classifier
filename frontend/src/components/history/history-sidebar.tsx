'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HistoryItem } from './history-item'
import { HistoryEmpty } from './history-empty'
import type { HistoryItem as HistoryItemType } from '@/lib/hooks/use-history'

interface HistorySidebarProps {
  history: HistoryItemType[]
  formatTimestamp: (timestamp: number) => string
  onSelectItem: (item: HistoryItemType) => void
  onClearHistory: () => void
  activeItemId?: string
}

export function HistorySidebar({
  history,
  formatTimestamp,
  onSelectItem,
  onClearHistory,
  activeItemId,
}: HistorySidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
        <h2 className="text-lg font-semibold">History</h2>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearHistory}
            className="text-muted-foreground hover:text-destructive h-8 px-2"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {history.length === 0 ? (
          <HistoryEmpty />
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <HistoryItem
                key={item.id}
                item={item}
                formatTimestamp={formatTimestamp}
                onClick={() => onSelectItem(item)}
                isActive={item.id === activeItemId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

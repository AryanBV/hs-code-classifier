'use client'

import { History } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { HistorySidebar } from './history-sidebar'
import type { HistoryItem } from '@/lib/hooks/use-history'

interface HistorySheetProps {
  history: HistoryItem[]
  formatTimestamp: (timestamp: number) => string
  onSelectItem: (item: HistoryItem) => void
  onClearHistory: () => void
  activeItemId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HistorySheet({
  history,
  formatTimestamp,
  onSelectItem,
  onClearHistory,
  activeItemId,
  open,
  onOpenChange,
}: HistorySheetProps) {
  const handleSelectItem = (item: HistoryItem) => {
    onSelectItem(item)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
          <History className="h-4 w-4" />
          {history.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {history.length > 9 ? '9+' : history.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Classification History</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100%-60px)] overflow-hidden">
          <HistorySidebar
            history={history}
            formatTimestamp={formatTimestamp}
            onSelectItem={handleSelectItem}
            onClearHistory={onClearHistory}
            activeItemId={activeItemId}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

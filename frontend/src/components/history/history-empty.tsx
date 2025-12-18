'use client'

import { History } from 'lucide-react'
import { cn } from '@/lib/cn'

interface HistoryEmptyProps {
  compact?: boolean
}

export function HistoryEmpty({ compact = false }: HistoryEmptyProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center px-4 text-center",
      compact ? "py-6" : "py-12"
    )}>
      <div className={cn(
        "rounded-full bg-muted/50 flex items-center justify-center mb-3",
        compact ? "w-10 h-10" : "w-16 h-16"
      )}>
        <History className={cn(
          "text-muted-foreground",
          compact ? "w-5 h-5" : "w-8 h-8"
        )} />
      </div>
      <h3 className={cn(
        "font-medium text-muted-foreground mb-1",
        compact ? "text-xs" : "text-sm"
      )}>
        No history yet
      </h3>
      <p className={cn(
        "text-muted-foreground/70",
        compact ? "text-[10px]" : "text-xs"
      )}>
        Classifications will appear here
      </p>
    </div>
  )
}

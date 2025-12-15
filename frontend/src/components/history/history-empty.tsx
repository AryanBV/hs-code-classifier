'use client'

import { History } from 'lucide-react'

export function HistoryEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <History className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium mb-1">No history yet</h3>
      <p className="text-xs text-muted-foreground">
        Your classification history will appear here
      </p>
    </div>
  )
}

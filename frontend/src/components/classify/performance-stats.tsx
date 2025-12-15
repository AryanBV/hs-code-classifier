'use client'

import { Zap, Database } from 'lucide-react'

interface PerformanceStatsProps {
  processingTime?: number // in milliseconds
  codesSearched?: number
}

export function PerformanceStats({
  processingTime,
  codesSearched = 10468,
}: PerformanceStatsProps) {
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 py-4 px-4 rounded-xl bg-card/50 border border-border/50">
      {processingTime && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-primary" />
          <span>Processed in {formatTime(processingTime)}</span>
        </div>
      )}
      <div className="hidden md:block w-px h-4 bg-border" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Database className="h-4 w-4 text-primary" />
        <span>{codesSearched.toLocaleString()} codes analyzed</span>
      </div>
    </div>
  )
}

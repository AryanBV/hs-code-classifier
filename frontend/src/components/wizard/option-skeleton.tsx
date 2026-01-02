'use client'

import { cn } from '@/lib/cn'

// ============================================================================
// Types
// ============================================================================

interface OptionSkeletonProps {
  count?: number
}

// ============================================================================
// Component
// ============================================================================

/**
 * Loading skeleton that matches the OptionCard layout
 * Shows animated placeholders while options are loading
 */
export function OptionSkeleton({ count = 4 }: OptionSkeletonProps) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading options">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-full p-4 rounded-xl border-2 min-h-[72px]',
            'bg-slate-50 dark:bg-slate-800/40',
            'border-slate-200 dark:border-slate-700',
            'animate-pulse'
          )}
          style={{
            animationDelay: `${i * 100}ms`,
          }}
        >
          <div className="flex items-center gap-3">
            {/* Content skeleton */}
            <div className="flex-1 space-y-2">
              {/* Primary text */}
              <div
                className={cn(
                  'h-4 rounded',
                  'bg-slate-200 dark:bg-slate-700'
                )}
                style={{ width: `${70 + Math.random() * 20}%` }}
              />
              {/* Secondary text (50% chance) */}
              {i % 2 === 0 && (
                <div
                  className={cn(
                    'h-3 rounded',
                    'bg-slate-200 dark:bg-slate-700'
                  )}
                  style={{ width: `${40 + Math.random() * 20}%` }}
                />
              )}
            </div>

            {/* Code badge skeleton */}
            <div
              className={cn(
                'h-7 w-16 rounded-lg',
                'bg-slate-200 dark:bg-slate-700'
              )}
            />

            {/* Chevron skeleton */}
            <div
              className={cn(
                'h-5 w-5 rounded',
                'bg-slate-200 dark:bg-slate-700'
              )}
            />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading classification options...</span>
    </div>
  )
}

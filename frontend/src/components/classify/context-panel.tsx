'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'
import { Check, ChevronDown, ChevronUp, Layers, Sparkles, Target } from 'lucide-react'
import { useState } from 'react'

interface GatheredInfo {
  label: string
  value: string
}

interface PossibleCategory {
  chapter: string
  name: string
  probability: number
}

interface ContextPanelProps {
  understanding: number // 0-100
  gatheredInfo: GatheredInfo[]
  possibleCategories: PossibleCategory[]
  roundNumber: number
  totalQuestions: number
  className?: string
}

export function ContextPanel({
  understanding,
  gatheredInfo,
  possibleCategories,
  roundNumber,
  totalQuestions,
  className
}: ContextPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        'bg-card/50 backdrop-blur-xl border border-border rounded-2xl overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-blue-600/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">Understanding</h3>
            <p className="text-xs text-muted-foreground">Round {roundNumber} • {totalQuestions} questions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mini progress indicator */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-muted"
              />
              <motion.circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="url(#progressGradient)"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: understanding / 100 }}
                transition={{ duration: 1, ease: 'easeOut' }}
                style={{
                  strokeDasharray: '100',
                  strokeDashoffset: '0'
                }}
              />
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
              {understanding}%
            </span>
          </div>
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Collapsible content */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-5">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Classification confidence</span>
                  <span className="text-primary font-medium">{understanding}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${understanding}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full"
                    style={{
                      boxShadow: '0 0 20px rgba(6, 182, 212, 0.5)'
                    }}
                  />
                </div>
              </div>

              {/* Gathered information */}
              {gatheredInfo.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    <Check className="w-3 h-3" />
                    Gathered Information
                  </div>
                  <div className="space-y-2">
                    {gatheredInfo.map((info, index) => (
                      <motion.div
                        key={`${info.label}-${index}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-2 text-sm"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        <span className="text-muted-foreground">{info.label}:</span>
                        <span className="text-foreground font-medium">{info.value}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Possible categories */}
              {possibleCategories.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    <Target className="w-3 h-3" />
                    Narrowing To
                  </div>
                  <div className="space-y-2">
                    {possibleCategories.slice(0, 3).map((category, index) => (
                      <motion.div
                        key={category.chapter}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-primary">
                              Ch. {category.chapter}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {category.name}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {category.probability}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${category.probability}%` }}
                            transition={{ duration: 0.8, delay: index * 0.1 }}
                            className={cn(
                              'h-full rounded-full',
                              index === 0
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                : 'bg-muted-foreground'
                            )}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status indicator */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                  className="w-2 h-2 rounded-full bg-primary"
                />
                <span className="text-xs text-muted-foreground">
                  AI is analyzing your product...
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Mini context indicator for mobile
export function ContextIndicator({
  understanding,
  onClick
}: {
  understanding: number
  roundNumber?: number
  onClick: () => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-card/80 backdrop-blur-sm border border-border rounded-full hover:border-primary/50 transition-all"
    >
      <div className="relative w-6 h-6">
        <svg className="w-6 h-6 -rotate-90">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted"
          />
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="url(#miniGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${understanding * 0.628} 100`}
          />
          <defs>
            <linearGradient id="miniGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {understanding}%
      </span>
      <Layers className="w-3 h-3 text-muted-foreground" />
    </motion.button>
  )
}

'use client'

import { motion } from 'framer-motion'
import { MessageCircle, Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ConversationItem {
  type: 'question' | 'answer'
  content: string
  answer?: string
}

interface ConversationHistoryProps {
  items: ConversationItem[]
  className?: string
}

export function ConversationHistory({ items, className }: ConversationHistoryProps) {
  if (items.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className={cn('mb-4', className)}
    >
      <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
        <MessageCircle className="w-4 h-4" />
        <span>Previous Questions</span>
      </div>

      <div className="space-y-2 pl-2 border-l-2 border-muted">
        {items.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative pl-4"
          >
            {/* Connector dot */}
            <div className="absolute left-[-5px] top-2 w-2 h-2 rounded-full bg-primary/40" />

            {item.type === 'question' ? (
              <div className="text-sm">
                <span className="text-muted-foreground">Q: </span>
                <span className="text-foreground">{item.content}</span>
              </div>
            ) : (
              <div className="text-sm flex items-center gap-1">
                <Check className="w-3 h-3 text-success" />
                <span className="text-success font-medium">{item.content}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// Simplified inline version for the result card
interface ConversationSummaryInlineProps {
  questionsAsked: number
  answersProvided: number
  totalRounds: number
  durationMs: number
}

export function ConversationSummaryInline({
  questionsAsked,
  answersProvided,
  totalRounds,
  durationMs
}: ConversationSummaryInlineProps) {
  const durationSeconds = (durationMs / 1000).toFixed(1)

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <MessageCircle className="w-3 h-3" />
        <span>{questionsAsked} questions</span>
      </div>
      <div className="flex items-center gap-1">
        <Check className="w-3 h-3" />
        <span>{answersProvided} answers</span>
      </div>
      <div className="flex items-center gap-1">
        <ChevronRight className="w-3 h-3" />
        <span>{totalRounds} rounds</span>
      </div>
      <div className="flex items-center gap-1">
        <span>{durationSeconds}s</span>
      </div>
    </div>
  )
}

'use client'

import { ReactNode, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { AIAvatar, TypingIndicator } from './ai-avatar'
import { User } from 'lucide-react'

interface ChatMessageProps {
  type: 'ai' | 'user' | 'system'
  children: ReactNode
  timestamp?: Date
  isTyping?: boolean
  aiState?: 'idle' | 'thinking' | 'speaking' | 'success'
  delay?: number
  className?: string
}

export function ChatMessage({
  type,
  children,
  timestamp,
  isTyping = false,
  aiState = 'speaking',
  delay = 0,
  className
}: ChatMessageProps) {
  const [isVisible, setIsVisible] = useState(delay === 0)

  useEffect(() => {
    if (delay > 0) {
      const timer = setTimeout(() => setIsVisible(true), delay)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [delay])

  if (!isVisible) return null

  if (type === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className={cn(
          'flex justify-center my-4',
          className
        )}
      >
        <div className="px-4 py-2 rounded-full bg-muted/50 border border-border backdrop-blur-sm">
          <p className="text-xs text-muted-foreground font-medium tracking-wide">
            {children}
          </p>
        </div>
      </motion.div>
    )
  }

  const isAI = type === 'ai'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        ease: [0.23, 1, 0.32, 1],
        delay: delay / 1000
      }}
      className={cn(
        'flex gap-3 max-w-[85%]',
        isAI ? 'self-start' : 'self-end flex-row-reverse',
        className
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isAI ? (
          <AIAvatar state={isTyping ? 'thinking' : aiState} size="sm" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <User className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          'relative group',
          isAI ? 'pr-4' : 'pl-4'
        )}
      >
        {/* Glow effect for AI messages */}
        {isAI && (
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        )}

        <div
          className={cn(
            'relative px-4 py-3 rounded-2xl',
            isAI
              ? 'bg-card/90 border border-border text-card-foreground rounded-tl-sm'
              : 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white rounded-tr-sm shadow-lg shadow-cyan-500/20'
          )}
          style={isAI ? {
            backdropFilter: 'blur(12px)',
          } : {}}
        >
          {/* Subtle inner gradient for AI */}
          {isAI && (
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 rounded-2xl pointer-events-none" />
          )}

          {/* Content */}
          <div className="relative">
            {isTyping ? (
              <TypingIndicator />
            ) : (
              <div className="text-[15px] leading-relaxed">
                {children}
              </div>
            )}
          </div>
        </div>

        {/* Timestamp */}
        {timestamp && !isTyping && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className={cn(
              'text-[10px] text-muted-foreground mt-1.5 font-medium tracking-wide',
              isAI ? 'text-left ml-1' : 'text-right mr-1'
            )}
          >
            {formatTime(timestamp)}
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}

// Question options component for inline selection
interface QuestionOptionsProps {
  options: string[]
  selectedOption?: string
  onSelect: (option: string) => void
  disabled?: boolean
}

export function QuestionOptions({
  options,
  selectedOption,
  onSelect,
  disabled = false
}: QuestionOptionsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="flex flex-wrap gap-2 mt-3"
    >
      {options
        .filter(opt => opt.toLowerCase() !== 'other')
        .map((option, index) => (
          <motion.button
            key={option}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + index * 0.05 }}
            onClick={() => !disabled && onSelect(option)}
            disabled={disabled}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
              'border backdrop-blur-sm',
              'hover:scale-[1.02] active:scale-[0.98]',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
              selectedOption === option
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-transparent shadow-lg shadow-cyan-500/25'
                : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:bg-muted'
            )}
            whileHover={!disabled ? { y: -2 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
          >
            {/* Keyboard shortcut hint */}
            <span className="inline-flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-muted text-[10px] flex items-center justify-center text-muted-foreground font-mono">
                {index + 1}
              </span>
              {option}
            </span>
          </motion.button>
        ))}
    </motion.div>
  )
}

// Helper to format time
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Streaming text component for AI responses
interface StreamingTextProps {
  text: string
  speed?: number
  onComplete?: () => void
  className?: string
}

export function StreamingText({
  text,
  speed = 20,
  onComplete,
  className
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (isComplete) return

    let currentIndex = 0
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1))
        currentIndex++
      } else {
        clearInterval(interval)
        setIsComplete(true)
        onComplete?.()
      }
    }, speed)

    return () => clearInterval(interval)
  }, [text, speed, onComplete, isComplete])

  return (
    <span className={className}>
      {displayedText}
      {!isComplete && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
        />
      )}
    </span>
  )
}

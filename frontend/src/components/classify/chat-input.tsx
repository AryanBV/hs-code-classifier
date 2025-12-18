'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, X, Keyboard } from 'lucide-react'
import { cn } from '@/lib/cn'
import { AIAvatar } from './ai-avatar'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  disabled?: boolean
  placeholder?: string
  showExamples?: boolean
}

const EXAMPLES = [
  'Cotton t-shirts for men',
  'LED light bulbs 60W',
  'Stainless steel cookware',
  'Organic green tea leaves',
]

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled = false,
  placeholder = 'Describe your product...',
  showExamples = true
}: ChatInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const minChars = 3  // Reduced from 10 to 3 for better UX
  const maxChars = 1000

  useEffect(() => {
    // Listen for example selection from welcome message
    const handleSelectExample = (e: CustomEvent) => {
      onChange(e.detail)
      textareaRef.current?.focus()
    }

    window.addEventListener('selectExample', handleSelectExample as EventListener)
    return () => window.removeEventListener('selectExample', handleSelectExample as EventListener)
  }, [onChange])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [value])

  const canSubmit = value.trim().length >= minChars && value.length <= maxChars && !isLoading && !disabled

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative">
      {/* Ambient glow behind input */}
      <div
        className={cn(
          'absolute -inset-2 rounded-3xl transition-all duration-500',
          isFocused
            ? 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 blur-xl'
            : 'bg-transparent'
        )}
      />

      {/* Main input container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className={cn(
          'relative flex items-end gap-3 p-4 rounded-2xl border backdrop-blur-xl transition-all duration-300',
          isFocused
            ? 'bg-card/80 border-primary/50 shadow-glow'
            : 'bg-card/60 border-border',
          disabled && 'opacity-60 pointer-events-none'
        )}
      >
        {/* AI Avatar indicator */}
        <div className="flex-shrink-0 self-end pb-1">
          <AIAvatar state={isLoading ? 'thinking' : 'idle'} size="sm" />
        </div>

        {/* Input area */}
        <div className="flex-1 min-w-0">
          {/* Example chips */}
          <AnimatePresence>
            {showExamples && !value && !isFocused && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 overflow-hidden"
              >
                <p className="text-xs text-muted-foreground mb-2 font-medium">Try an example:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example, index) => (
                    <motion.button
                      key={example}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        onChange(example)
                        // Focus textarea after selecting example
                        setTimeout(() => textareaRef.current?.focus(), 50)
                      }}
                      className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg hover:border-primary/50 hover:text-primary transition-all duration-200"
                    >
                      {example}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={disabled || isLoading}
              placeholder={placeholder}
              rows={1}
              className={cn(
                'w-full bg-transparent text-foreground placeholder-muted-foreground resize-none outline-none text-[15px] leading-relaxed pr-8',
                'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent'
              )}
              style={{ maxHeight: '150px' }}
            />

            {/* Clear button */}
            <AnimatePresence>
              {value && !isLoading && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => onChange('')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            {/* Character count */}
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-xs font-mono transition-colors',
                  value.length > maxChars
                    ? 'text-destructive'
                    : canSubmit
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                {value.length}/{maxChars}
              </span>

              {value.length > 0 && value.trim().length < minChars && (
                <span className="text-xs text-amber-500">
                  Min {minChars} chars
                </span>
              )}
            </div>

            {/* Keyboard hint */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Keyboard className="w-3 h-3" />
              <span className="hidden sm:inline">Enter to send</span>
            </div>
          </div>
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'flex-shrink-0 p-3 rounded-xl transition-all duration-300',
            canSubmit
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-glow hover:shadow-glow-lg hover:scale-105 active:scale-95 cursor-pointer'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </motion.div>
    </div>
  )
}

// Compact input for continuing conversation
export function QuickReplyInput({
  onSubmit,
  isLoading,
  placeholder = 'Add more details...'
}: {
  onSubmit: (value: string) => void
  isLoading: boolean
  placeholder?: string
}) {
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    if (value.trim() && !isLoading) {
      onSubmit(value.trim())
      setValue('')
    }
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 border border-border rounded-xl">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder={placeholder}
        disabled={isLoading}
        className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || isLoading}
        className={cn(
          'p-2 rounded-lg transition-all',
          value.trim() && !isLoading
            ? 'bg-primary/20 text-primary hover:bg-primary/30'
            : 'text-muted-foreground cursor-not-allowed'
        )}
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  )
}

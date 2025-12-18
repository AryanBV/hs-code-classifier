'use client'

import { ReactNode, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ChatContainerProps {
  children: ReactNode
  className?: string
  autoScroll?: boolean
  centerContent?: boolean
}

export function ChatContainer({
  children,
  className,
  autoScroll = true,
  centerContent = false
}: ChatContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when children change
  useEffect(() => {
    if (autoScroll && bottomRef.current && !centerContent) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [children, autoScroll, centerContent])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-y-auto overflow-x-hidden',
        'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
        className
      )}
    >
      {/* Ambient background effects - works with both themes */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Gradient mesh background - using primary color for theme awareness */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/3 rounded-full blur-3xl" />

        {/* Subtle grid pattern - theme aware */}
        <div
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--foreground) / 0.1) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--foreground) / 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}
        />

        {/* Top fade */}
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent z-10" />

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent z-10" />
      </div>

      {/* Messages container */}
      <div className={cn(
        "relative z-20 flex flex-col gap-4 px-4 py-6 h-full",
        centerContent && "justify-center items-center"
      )}>
        {children}
        {!centerContent && <div ref={bottomRef} className="h-px" />}
      </div>
    </div>
  )
}

// Welcome message component
export function WelcomeMessage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center justify-center py-8 text-center max-w-2xl mx-auto"
    >
      {/* Decorative orb */}
      <motion.div
        className="relative w-24 h-24 mb-8"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      >
        {/* Outer glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 rounded-full blur-2xl" />

        {/* Main orb */}
        <div className="absolute inset-2 bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600 rounded-full shadow-2xl shadow-cyan-500/30">
          {/* Inner shine */}
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-white/20 rounded-full" />

          {/* Animated rings */}
          <motion.div
            className="absolute inset-0 border-2 border-cyan-400/30 rounded-full"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.5, 0, 0.5]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeOut'
            }}
          />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-2xl font-bold text-foreground mb-3"
      >
        Ready to Classify
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-muted-foreground max-w-md leading-relaxed"
      >
        Describe your product and I&apos;ll find the perfect HS code.
        I may ask a few questions to ensure accuracy.
      </motion.p>

      {/* Feature highlights */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap justify-center gap-3 mt-8"
      >
        {[
          { icon: '🎯', label: '10,468 HS Codes' },
          { icon: '⚡', label: 'Instant Results' },
          { icon: '🧠', label: 'AI-Powered' }
        ].map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 + index * 0.1 }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border backdrop-blur-sm"
          >
            <span>{item.icon}</span>
            <span className="text-sm text-muted-foreground font-medium">{item.label}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick examples */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="mt-10"
      >
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-medium">
          Try an example
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            'Cotton t-shirts for men',
            'LED light bulbs',
            'Stainless steel cookware',
            'Organic green tea'
          ].map((example, index) => (
            <motion.button
              key={example}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + index * 0.05 }}
              className="px-3 py-1.5 text-sm text-muted-foreground bg-muted/30 border border-border rounded-lg hover:border-primary/50 hover:text-primary hover:bg-muted/50 transition-all duration-300"
              onClick={() => {
                // This will be connected to the input in the parent component
                const event = new CustomEvent('selectExample', { detail: example })
                window.dispatchEvent(event)
              }}
            >
              {example}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Conversation divider
export function ConversationDivider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4 my-6 w-full max-w-3xl mx-auto">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <span className="text-xs text-muted-foreground font-medium tracking-wider uppercase">
        {text}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  )
}

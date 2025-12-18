'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Brain, CheckCircle, Database, Sparkles } from 'lucide-react'
import { AIAvatar } from './ai-avatar'
import { cn } from '@/lib/cn'

const phases = [
  {
    icon: Search,
    text: 'Analyzing your product description...',
    subtext: 'Understanding key characteristics',
    duration: 2000,
    color: 'from-cyan-500 to-blue-500',
  },
  {
    icon: Database,
    text: 'Searching through 10,468 HS codes...',
    subtext: 'Matching against tariff schedule',
    duration: 2500,
    color: 'from-blue-500 to-purple-500',
  },
  {
    icon: Brain,
    text: 'AI analyzing classification rules...',
    subtext: 'Applying GRI principles',
    duration: 2000,
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: CheckCircle,
    text: 'Generating classification with reasoning...',
    subtext: 'Preparing detailed explanation',
    duration: 1500,
    color: 'from-emerald-500 to-cyan-500',
  },
]

const tips = [
  'More specific descriptions yield better results',
  'Include material composition when relevant',
  'Mention intended use for ambiguous products',
  'Include dimensions or weight if applicable',
]

export function LoadingState() {
  const [currentPhase, setCurrentPhase] = useState(0)
  const [codeCount, setCodeCount] = useState(0)
  const [currentTip, setCurrentTip] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentPhase((prev) => (prev + 1) % phases.length)
    }, phases[currentPhase]?.duration ?? 2000)

    return () => clearInterval(timer)
  }, [currentPhase])

  // Animate code counter
  useEffect(() => {
    if (currentPhase === 1) {
      const targetCount = 10468
      const duration = 2000
      const steps = 50
      const increment = targetCount / steps
      const interval = duration / steps

      let count = 0
      const timer = setInterval(() => {
        count += increment
        if (count >= targetCount) {
          setCodeCount(targetCount)
          clearInterval(timer)
        } else {
          setCodeCount(Math.floor(count))
        }
      }, interval)

      return () => clearInterval(timer)
    }
    return undefined
  }, [currentPhase])

  // Rotate tips
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length)
    }, 4000)

    return () => clearInterval(timer)
  }, [])

  const CurrentIcon = phases[currentPhase]?.icon ?? Search
  const currentColor = phases[currentPhase]?.color ?? 'from-cyan-500 to-blue-500'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-12 md:py-16"
    >
      {/* Main animated container */}
      <div className="relative mb-8">
        {/* Outer glow rings */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.1, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className={cn(
            'absolute -inset-8 rounded-full bg-gradient-to-r blur-2xl',
            currentColor
          )}
          style={{ opacity: 0.2 }}
        />

        <motion.div
          animate={{
            scale: [1.1, 1.3, 1.1],
            opacity: [0.2, 0.05, 0.2],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
          className={cn(
            'absolute -inset-12 rounded-full bg-gradient-to-r blur-3xl',
            currentColor
          )}
          style={{ opacity: 0.15 }}
        />

        {/* Orbiting particles */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              rotate: 360,
            }}
            transition={{
              duration: 3 + i,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="absolute inset-0"
            style={{
              transformOrigin: 'center center',
            }}
          >
            <motion.div
              animate={{
                opacity: [0.5, 1, 0.5],
                scale: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.3,
              }}
              className={cn(
                'absolute w-2 h-2 rounded-full bg-gradient-to-r',
                currentColor
              )}
              style={{
                top: '50%',
                left: -8 - (i * 8),
                transform: 'translateY(-50%)',
                boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
              }}
            />
          </motion.div>
        ))}

        {/* Central AI Avatar */}
        <div className="relative">
          <AIAvatar state="thinking" size="lg" />
        </div>
      </div>

      {/* Phase indicator with icon */}
      <motion.div
        key={currentPhase}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="text-center mb-6"
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <motion.div
            animate={{
              rotate: currentPhase === 1 ? 0 : [0, 10, -10, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{
              duration: 0.5,
              repeat: currentPhase === 2 ? Infinity : 0,
              repeatDelay: 1
            }}
          >
            <CurrentIcon className={cn(
              'w-5 h-5',
              currentPhase === 0 && 'text-cyan-400',
              currentPhase === 1 && 'text-blue-400',
              currentPhase === 2 && 'text-purple-400',
              currentPhase === 3 && 'text-emerald-400',
            )} />
          </motion.div>
          <span className="text-lg font-medium text-foreground">
            {phases[currentPhase]?.text ?? 'Processing...'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {phases[currentPhase]?.subtext}
        </p>

        {/* Animated code counter */}
        {currentPhase === 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 font-mono text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
          >
            {codeCount.toLocaleString()}
          </motion.div>
        )}
      </motion.div>

      {/* Progress dots */}
      <div className="flex gap-3 mb-8">
        {phases.map((phase, index) => (
          <motion.div
            key={index}
            animate={{
              scale: index === currentPhase ? 1.2 : 1,
            }}
            className="relative"
          >
            <div
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-all duration-500',
                index === currentPhase
                  ? 'bg-gradient-to-r ' + phase.color
                  : index < currentPhase
                  ? 'bg-muted-foreground'
                  : 'bg-muted'
              )}
              style={{
                boxShadow: index === currentPhase
                  ? '0 0 15px rgba(6, 182, 212, 0.5)'
                  : 'none'
              }}
            />
            {index === currentPhase && (
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className={cn(
                  'absolute inset-0 rounded-full bg-gradient-to-r',
                  phase.color
                )}
              />
            )}
          </motion.div>
        ))}
      </div>

      {/* Rotating tips */}
      <motion.div
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border"
      >
        <Sparkles className="w-4 h-4 text-amber-400" />
        <AnimatePresence mode="wait">
          <motion.span
            key={currentTip}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-muted-foreground"
          >
            {tips[currentTip]}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

// Compact loading for inline use
export function LoadingDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, -4, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
          className="w-1.5 h-1.5 rounded-full bg-primary"
        />
      ))}
    </div>
  )
}

// Skeleton loading for results
export function ResultSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded-lg" />
      <div className="p-6 rounded-2xl bg-muted/50 border border-border">
        <div className="h-12 w-32 bg-muted rounded-lg mb-4" />
        <div className="h-4 w-full bg-muted rounded mb-2" />
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
    </div>
  )
}

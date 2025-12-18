'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface AIAvatarProps {
  state?: 'idle' | 'thinking' | 'speaking' | 'success'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AIAvatar({ state = 'idle', size = 'md', className }: AIAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14'
  }

  const glowSizes = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20'
  }

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* Outer glow ring */}
      <motion.div
        className={cn(
          'absolute rounded-full',
          glowSizes[size],
          state === 'thinking' && 'bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20',
          state === 'speaking' && 'bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-cyan-500/30',
          state === 'success' && 'bg-gradient-to-r from-emerald-500/30 via-teal-500/30 to-emerald-500/30',
          state === 'idle' && 'bg-gradient-to-r from-slate-500/10 via-blue-500/10 to-slate-500/10'
        )}
        animate={state === 'thinking' ? {
          scale: [1, 1.2, 1],
          rotate: [0, 180, 360],
          opacity: [0.5, 0.8, 0.5]
        } : state === 'speaking' ? {
          scale: [1, 1.1, 1],
          opacity: [0.6, 0.9, 0.6]
        } : state === 'success' ? {
          scale: [1, 1.15, 1],
          opacity: [0.7, 1, 0.7]
        } : {
          scale: [1, 1.05, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{
          duration: state === 'thinking' ? 2 : 3,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
        style={{ filter: 'blur(8px)' }}
      />

      {/* Middle pulse ring */}
      <motion.div
        className={cn(
          'absolute rounded-full border',
          sizeClasses[size],
          state === 'thinking' && 'border-cyan-400/40',
          state === 'speaking' && 'border-blue-400/50',
          state === 'success' && 'border-emerald-400/50',
          state === 'idle' && 'border-slate-500/20'
        )}
        animate={state !== 'idle' ? {
          scale: [1, 1.3, 1],
          opacity: [0.8, 0, 0.8]
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeOut'
        }}
      />

      {/* Core orb */}
      <motion.div
        className={cn(
          'relative rounded-full flex items-center justify-center overflow-hidden',
          sizeClasses[size],
          'bg-gradient-to-br',
          state === 'thinking' && 'from-cyan-500 via-blue-600 to-purple-600',
          state === 'speaking' && 'from-blue-500 via-cyan-500 to-blue-600',
          state === 'success' && 'from-emerald-500 via-teal-500 to-emerald-600',
          state === 'idle' && 'from-slate-600 via-blue-700 to-slate-700'
        )}
        animate={state === 'thinking' ? {
          scale: [1, 0.95, 1.05, 1]
        } : {}}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
        style={{
          boxShadow: state === 'thinking'
            ? '0 0 30px rgba(6, 182, 212, 0.5), inset 0 0 20px rgba(255,255,255,0.1)'
            : state === 'speaking'
            ? '0 0 25px rgba(59, 130, 246, 0.4), inset 0 0 15px rgba(255,255,255,0.1)'
            : state === 'success'
            ? '0 0 25px rgba(16, 185, 129, 0.4), inset 0 0 15px rgba(255,255,255,0.1)'
            : '0 0 15px rgba(100, 116, 139, 0.2), inset 0 0 10px rgba(255,255,255,0.05)'
        }}
      >
        {/* Inner shine */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-white/20 rounded-full" />

        {/* Neural pattern overlay */}
        <svg
          className="absolute inset-0 w-full h-full opacity-30"
          viewBox="0 0 100 100"
        >
          <motion.circle
            cx="50"
            cy="50"
            r="3"
            fill="white"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.circle
            cx="30"
            cy="35"
            r="2"
            fill="white"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
          />
          <motion.circle
            cx="70"
            cy="40"
            r="2"
            fill="white"
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: 0.4 }}
          />
          <motion.circle
            cx="35"
            cy="65"
            r="2"
            fill="white"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: 0.6 }}
          />
          <motion.circle
            cx="65"
            cy="70"
            r="2"
            fill="white"
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: 0.3 }}
          />
          {/* Connecting lines */}
          <motion.line
            x1="50" y1="50" x2="30" y2="35"
            stroke="white"
            strokeWidth="0.5"
            animate={{ opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.line
            x1="50" y1="50" x2="70" y2="40"
            stroke="white"
            strokeWidth="0.5"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: 0.3 }}
          />
          <motion.line
            x1="50" y1="50" x2="35" y2="65"
            stroke="white"
            strokeWidth="0.5"
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: 0.5 }}
          />
          <motion.line
            x1="50" y1="50" x2="65" y2="70"
            stroke="white"
            strokeWidth="0.5"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.9, repeat: Infinity, delay: 0.2 }}
          />
        </svg>
      </motion.div>
    </div>
  )
}

// Typing indicator with dots
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-cyan-400/70"
          animate={{
            y: [0, -6, 0],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut'
          }}
        />
      ))}
    </div>
  )
}

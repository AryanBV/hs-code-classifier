'use client'

import { motion } from 'framer-motion'
import { WifiOff, SearchX, Clock, ServerCrash, AlertCircle, AlertTriangle } from 'lucide-react'
import type { ErrorType } from '@/lib/types/errors'

// ============================================================================
// Types
// ============================================================================

interface ErrorIconProps {
  type: ErrorType
}

interface IconConfig {
  Icon: typeof WifiOff
  color: string
  bg: string
  glow: string
}

// ============================================================================
// Icon Configuration
// ============================================================================

const iconConfigs: Record<ErrorType, IconConfig> = {
  network: {
    Icon: WifiOff,
    color: 'text-orange-500',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    glow: 'bg-orange-500/20 dark:bg-orange-400/10'
  },
  timeout: {
    Icon: Clock,
    color: 'text-amber-500',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    glow: 'bg-amber-500/20 dark:bg-amber-400/10'
  },
  server: {
    Icon: ServerCrash,
    color: 'text-red-500',
    bg: 'bg-red-100 dark:bg-red-900/30',
    glow: 'bg-red-500/20 dark:bg-red-400/10'
  },
  rate_limit: {
    Icon: Clock,
    color: 'text-purple-500',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    glow: 'bg-purple-500/20 dark:bg-purple-400/10'
  },
  classification: {
    Icon: SearchX,
    color: 'text-blue-500',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    glow: 'bg-blue-500/20 dark:bg-blue-400/10'
  },
  validation: {
    Icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    glow: 'bg-amber-500/20 dark:bg-amber-400/10'
  },
  unknown: {
    Icon: AlertCircle,
    color: 'text-slate-500',
    bg: 'bg-slate-100 dark:bg-slate-800',
    glow: 'bg-slate-500/20 dark:bg-slate-400/10'
  }
}

// ============================================================================
// Component
// ============================================================================

export function ErrorIcon({ type }: ErrorIconProps) {
  const config = iconConfigs[type] || iconConfigs.unknown
  const { Icon, color, bg, glow } = config

  return (
    <motion.div
      className="relative"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
    >
      {/* Glow effect */}
      <div className={`absolute inset-0 ${glow} rounded-2xl blur-xl scale-110`} />

      {/* Icon container */}
      <div
        className={`relative w-20 h-20 rounded-2xl ${bg} border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-center`}
      >
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 15 }}
        >
          <Icon className={`w-10 h-10 ${color}`} strokeWidth={1.5} />
        </motion.div>
      </div>
    </motion.div>
  )
}

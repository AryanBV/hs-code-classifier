'use client'

import { motion } from 'framer-motion'
import { Search, Package, FileSearch, CheckCircle } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface LoadingIconProps {
  currentStep: number
}

// ============================================================================
// Constants
// ============================================================================

const ICONS = [
  { Icon: Package, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  { Icon: Search, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  { Icon: FileSearch, color: 'text-cyan-500', bg: 'bg-cyan-100 dark:bg-cyan-900/30' },
  { Icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' }
]

// ============================================================================
// Component
// ============================================================================

export function LoadingIcon({ currentStep }: LoadingIconProps) {
  const currentIndex = Math.min(currentStep - 1, ICONS.length - 1)
  const current = ICONS[currentIndex]!
  const { Icon, color, bg } = current

  return (
    <div className="relative">
      {/* Pulsing rings */}
      <motion.div
        className={`absolute inset-0 rounded-2xl ${bg}`}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.2, 0.5]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
        style={{ width: '80px', height: '80px', margin: '-8px' }}
      />

      {/* Main icon container */}
      <motion.div
        className={`relative w-16 h-16 rounded-2xl ${bg} flex items-center justify-center`}
        animate={{
          rotate: [0, 5, -5, 0]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      >
        <Icon className={`w-8 h-8 ${color}`} />
      </motion.div>
    </div>
  )
}

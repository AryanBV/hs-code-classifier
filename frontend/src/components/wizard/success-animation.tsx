'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

interface SuccessAnimationProps {
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: {
    container: 'w-12 h-12',
    icon: 'w-6 h-6',
    ring1: 'w-16 h-16',
    ring2: 'w-20 h-20',
  },
  md: {
    container: 'w-16 h-16',
    icon: 'w-8 h-8',
    ring1: 'w-20 h-20',
    ring2: 'w-24 h-24',
  },
  lg: {
    container: 'w-20 h-20',
    icon: 'w-10 h-10',
    ring1: 'w-28 h-28',
    ring2: 'w-36 h-36',
  },
}

export function SuccessAnimation({ size = 'lg' }: SuccessAnimationProps) {
  const s = sizes[size]

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse ring 1 */}
      <motion.div
        className={`absolute ${s.ring2} rounded-full border-2 border-emerald-500/30`}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1.2, opacity: [0, 0.5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
      />

      {/* Outer pulse ring 2 */}
      <motion.div
        className={`absolute ${s.ring1} rounded-full border-2 border-emerald-500/40`}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1.3, opacity: [0, 0.6, 0] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeOut',
          delay: 0.2,
        }}
      />

      {/* Glow effect */}
      <motion.div
        className={`absolute ${s.container} rounded-full bg-emerald-500/20 blur-xl`}
        initial={{ scale: 0 }}
        animate={{ scale: 1.5 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      />

      {/* Main circle */}
      <motion.div
        className={`${s.container} rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/40`}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 200,
          damping: 15,
          delay: 0.1,
        }}
      >
        {/* Checkmark with draw animation */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3, type: 'spring' }}
        >
          <Check className={`${s.icon} text-white stroke-[3]`} />
        </motion.div>
      </motion.div>
    </div>
  )
}

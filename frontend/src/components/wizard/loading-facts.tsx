'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb } from 'lucide-react'

// ============================================================================
// Constants
// ============================================================================

const FACTS = [
  {
    text: "India's HS codes have 8 digits - the first 6 are international, last 2 are India-specific.",
    emoji: '🇮🇳'
  },
  {
    text: "HS stands for 'Harmonized System' - used by 200+ countries for trade classification.",
    emoji: '🌍'
  },
  {
    text: "The HS system covers over 5,000 commodity groups, organized into 21 sections and 99 chapters.",
    emoji: '📚'
  },
  {
    text: "Correct HS classification can save up to 15% on import duties through proper tariff optimization.",
    emoji: '💰'
  },
  {
    text: "The World Customs Organization updates HS codes every 5 years. The current version is HS 2022.",
    emoji: '📅'
  },
  {
    text: "India exports to 190+ countries. Top exports include refined petroleum, diamonds, and pharmaceuticals.",
    emoji: '🚢'
  },
  {
    text: "A wrong HS code can lead to shipment delays, fines, and even seizure of goods at customs.",
    emoji: '⚠️'
  },
  {
    text: "Chapter 85 (Electrical machinery) has the most sub-headings in the entire HS system.",
    emoji: '⚡'
  }
]

// ============================================================================
// Component
// ============================================================================

export function LoadingFacts() {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % FACTS.length)
    }, 4000) // Change fact every 4 seconds

    return () => clearInterval(interval)
  }, [])

  const fact = FACTS[currentIndex]!

  return (
    <motion.div
      className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.3 }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
            Did you know?
          </p>

          <AnimatePresence mode="wait">
            <motion.p
              key={currentIndex}
              className="text-sm text-slate-600 dark:text-slate-400"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
            >
              <span className="mr-2">{fact.emoji}</span>
              {fact.text}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

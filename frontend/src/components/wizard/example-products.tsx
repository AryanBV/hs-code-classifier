'use client'

import { motion } from 'framer-motion'

// ============================================================================
// Types
// ============================================================================

interface ExampleProduct {
  title: string
  subtitle: string
  fullText: string
}

// ============================================================================
// Constants
// ============================================================================

const EXAMPLES: ExampleProduct[] = [
  {
    title: 'LED Bulbs',
    subtitle: '60W, household',
    fullText: 'LED light bulbs 60W for household use',
  },
  {
    title: 'Coffee Beans',
    subtitle: 'Arabica, roasted',
    fullText: 'Roasted Arabica coffee beans 1kg bags',
  },
  {
    title: 'T-Shirts',
    subtitle: "Cotton, men's",
    fullText: "Men's cotton t-shirts plain white",
  },
  {
    title: 'Basmati Rice',
    subtitle: '5kg bags',
    fullText: 'Basmati rice premium quality 5kg bags',
  },
  {
    title: 'Phone Cases',
    subtitle: 'Silicone',
    fullText: 'Silicone phone cases for iPhone protective',
  },
  {
    title: 'Steel Bolts',
    subtitle: 'M8, stainless',
    fullText: 'Stainless steel bolts M8 x 50mm',
  },
]

// ============================================================================
// Component
// ============================================================================

interface ExampleProductsProps {
  onSelectExample: (text: string) => void
}

export function ExampleProducts({ onSelectExample }: ExampleProductsProps) {
  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
        Try an example:
      </p>

      <div className="grid grid-cols-3 gap-2">
        {EXAMPLES.map((example, index) => (
          <motion.button
            key={example.title}
            onClick={() => onSelectExample(example.fullText)}
            className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-cyan-400 dark:hover:border-cyan-500 hover:bg-white dark:hover:bg-slate-800 transition-all text-center group"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.03, duration: 0.3 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
              {example.title}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {example.subtitle}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

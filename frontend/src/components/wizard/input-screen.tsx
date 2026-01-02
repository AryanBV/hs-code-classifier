'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { InputCard } from './input-card'
import { ExampleProducts } from './example-products'
import { TrustIndicators } from './trust-indicators'

// ============================================================================
// Types
// ============================================================================

interface InputScreenProps {
  onSubmit: (product: string) => void
  isLoading: boolean
  error?: string | null
}

// ============================================================================
// Component
// ============================================================================

export function InputScreen({ onSubmit, isLoading, error = null }: InputScreenProps) {
  const [product, setProduct] = useState('')

  const handleSubmit = () => {
    if (product.trim()) {
      onSubmit(product.trim())
    }
  }

  const handleSelectExample = (text: string) => {
    setProduct(text)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 md:px-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Logo/Icon */}
          <motion.div
            className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, type: 'spring', stiffness: 200 }}
          >
            <Search className="w-7 h-7 text-white" />
          </motion.div>

          <motion.h1
            className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            HS Code Classifier
          </motion.h1>

          <motion.p
            className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-md mx-auto"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            Find the correct HS code for your export product in seconds, powered by AI
          </motion.p>
        </motion.div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Input Card */}
          <InputCard
            value={product}
            onChange={setProduct}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            error={error}
          />

          {/* Example Products - only show when input is empty */}
          {!product && <ExampleProducts onSelectExample={handleSelectExample} />}

          {/* Trust Indicators */}
          <TrustIndicators />
        </div>
      </div>
    </div>
  )
}

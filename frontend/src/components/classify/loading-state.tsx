'use client'

import { useState, useEffect } from 'react'
import { Loader2, Search, Brain, CheckCircle } from 'lucide-react'

const phases = [
  {
    icon: Search,
    text: 'Analyzing your product description...',
    duration: 1500,
  },
  {
    icon: Brain,
    text: 'Searching through 10,468 HS codes...',
    duration: 2000,
  },
  {
    icon: CheckCircle,
    text: 'Generating classification with reasoning...',
    duration: 1500,
  },
]

export function LoadingState() {
  const [currentPhase, setCurrentPhase] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentPhase((prev) => (prev + 1) % phases.length)
    }, phases[currentPhase]?.duration ?? 1500)

    return () => clearInterval(timer)
  }, [currentPhase])

  const CurrentIcon = phases[currentPhase]?.icon ?? Search

  return (
    <div className="flex flex-col items-center justify-center py-12 md:py-16">
      {/* Animated loader */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-card border border-border flex items-center justify-center">
          <Loader2 className="w-8 h-8 md:w-10 md:h-10 text-primary animate-spin" />
        </div>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-2 mb-4">
        <CurrentIcon className="w-5 h-5 text-primary" />
        <span className="text-lg font-medium animate-fade-in">
          {phases[currentPhase]?.text ?? 'Processing...'}
        </span>
      </div>

      {/* Progress dots */}
      <div className="flex gap-2">
        {phases.map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentPhase
                ? 'bg-primary w-6'
                : index < currentPhase
                ? 'bg-primary/50'
                : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

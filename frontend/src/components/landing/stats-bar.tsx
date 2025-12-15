'use client'

import { useEffect, useState } from 'react'
import { Database, Zap, Brain, Gift } from 'lucide-react'

const stats = [
  {
    icon: Database,
    value: '10,468',
    label: 'HS Codes',
    description: 'Comprehensive database',
  },
  {
    icon: Zap,
    value: '<30s',
    label: 'Classification',
    description: 'Lightning fast',
  },
  {
    icon: Brain,
    value: 'GPT-4o',
    label: 'AI Powered',
    description: 'Advanced reasoning',
  },
  {
    icon: Gift,
    value: 'Free',
    label: 'To Try',
    description: 'No credit card',
  },
]

export function StatsBar() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  return (
    <section className="py-12 md:py-16 border-y border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="container">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center text-center transition-all duration-500 ${
                isVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-3">
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl md:text-3xl font-bold text-foreground mb-1">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-foreground mb-0.5">
                {stat.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {stat.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

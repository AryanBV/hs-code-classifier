'use client'

import { useEffect, useState } from 'react'

interface ConfidenceMeterProps {
  value: number // 0-100
  size?: 'sm' | 'md' | 'lg'
}

export function ConfidenceMeter({ value, size = 'md' }: ConfidenceMeterProps) {
  const [animatedValue, setAnimatedValue] = useState(0)

  useEffect(() => {
    // Animate from 0 to value
    const duration = 1000
    const steps = 60
    const increment = value / steps
    let current = 0

    const timer = setInterval(() => {
      current += increment
      if (current >= value) {
        setAnimatedValue(value)
        clearInterval(timer)
      } else {
        setAnimatedValue(Math.round(current))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  // Size configurations
  const sizes = {
    sm: { container: 'w-16 h-16', stroke: 4, text: 'text-lg' },
    md: { container: 'w-24 h-24', stroke: 6, text: 'text-2xl' },
    lg: { container: 'w-32 h-32', stroke: 8, text: 'text-3xl' },
  }

  const config = sizes[size]
  const radius = size === 'sm' ? 28 : size === 'md' ? 42 : 56
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (animatedValue / 100) * circumference

  // Color based on confidence
  const getColor = (val: number) => {
    if (val >= 80) return { stroke: 'stroke-success', text: 'text-success', label: 'High Confidence' }
    if (val >= 60) return { stroke: 'stroke-warning', text: 'text-warning', label: 'Medium Confidence' }
    return { stroke: 'stroke-destructive', text: 'text-destructive', label: 'Low Confidence' }
  }

  const color = getColor(animatedValue)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${config.container}`}>
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.stroke}
            className="text-border"
          />
          {/* Progress circle */}
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
            strokeWidth={config.stroke}
            strokeLinecap="round"
            className={`${color.stroke} transition-all duration-1000 ease-out`}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold ${config.text} ${color.text}`}>
            {animatedValue}%
          </span>
        </div>
      </div>
      {/* Label */}
      <span className={`text-sm font-medium ${color.text}`}>
        {color.label}
      </span>
    </div>
  )
}

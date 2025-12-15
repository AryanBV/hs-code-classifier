'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnimatedBackground } from './animated-bg'

export function Hero() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const fadeClass = isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center overflow-hidden">
      <AnimatedBackground />

      <div className="container relative z-10 py-16 md:py-24">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className={`transition-all duration-700 ease-out ${fadeClass}`}>
            <Badge
              variant="outline"
              className="mb-6 px-4 py-1.5 text-sm border-primary/30 bg-primary/5 backdrop-blur-sm hover:border-primary/50 hover:bg-primary/10 transition-colors cursor-default group"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary group-hover:animate-pulse" />
              AI-Powered HS Code Classification
            </Badge>
          </div>

          {/* Headline */}
          <h1 className={`text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 transition-all duration-700 delay-100 ease-out ${fadeClass}`}>
            Classify products in{' '}
            <span className="gradient-text relative">
              seconds
              <span className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 to-blue-500/50 rounded-full blur-sm" />
            </span>
            ,<br className="hidden md:block" /> not hours.
          </h1>

          {/* Subheadline */}
          <p className={`text-lg md:text-xl text-muted-foreground max-w-2xl mb-8 leading-relaxed transition-all duration-700 delay-200 ease-out ${fadeClass}`}>
            AI that understands your products and finds the exact HS code — with reasoning you can trust. Built for exporters who value accuracy and speed.
          </p>

          {/* CTA buttons */}
          <div className={`flex flex-col sm:flex-row gap-4 w-full sm:w-auto transition-all duration-700 delay-300 ease-out ${fadeClass}`}>
            <Button asChild size="xl" className="w-full sm:w-auto group relative overflow-hidden">
              <Link href="/classify">
                <span className="relative z-10 flex items-center">
                  Start Classifying
                  <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="w-full sm:w-auto group">
              <a href="#how-it-works">
                See how it works
                <Zap className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
              </a>
            </Button>
          </div>

          {/* Trust indicator */}
          <div className={`mt-12 flex items-center gap-6 text-sm text-muted-foreground transition-all duration-700 delay-500 ease-out ${fadeClass}`}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>API Online</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <span>No credit card required</span>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <span className="hidden sm:block">Instant results</span>
          </div>
        </div>
      </div>
    </section>
  )
}

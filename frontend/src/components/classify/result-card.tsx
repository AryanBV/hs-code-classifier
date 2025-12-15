'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopyButton } from './copy-button'
import { ConfidenceMeter } from './confidence-meter'
import { ReasoningPanel } from './reasoning-panel'
import { FeedbackWidget } from './feedback-widget'
import { CheckCircle2, Sparkles } from 'lucide-react'

interface ClassificationResult {
  hsCode: string
  description: string
  confidence: number
  reasoning: string
}

interface ResultCardProps {
  result: ClassificationResult
  classificationId: string
  productDescription: string
}

export function ResultCard({ result, classificationId, productDescription }: ResultCardProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const fadeClass = isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'

  return (
    <div className={`space-y-4 transition-all duration-500 ${fadeClass}`}>
      {/* Success indicator */}
      <div className="flex items-center gap-2 text-success animate-fade-in">
        <CheckCircle2 className="w-5 h-5" />
        <span className="text-sm font-medium">Classification Complete</span>
      </div>

      {/* Main result card */}
      <Card className="overflow-hidden border-primary/20 shadow-glow">
        <CardContent className="p-0">
          {/* HS Code display - the star of the show */}
          <div className="relative p-6 md:p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
            {/* Animated background glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />

            {/* Badge */}
            <div className="relative mb-4">
              <Badge variant="outline" className="bg-primary/10 border-primary/30">
                <Sparkles className="w-3 h-3 mr-1" />
                HS Code Classification
              </Badge>
            </div>

            <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              {/* Code and description */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative">
                    <span className="font-mono text-4xl md:text-5xl font-bold text-primary tracking-wider drop-shadow-lg">
                      {result.hsCode}
                    </span>
                    <span className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-primary to-blue-500 rounded-full blur-sm opacity-50" />
                  </div>
                  <CopyButton text={result.hsCode} />
                </div>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
                  {result.description}
                </p>
              </div>

              {/* Confidence meter */}
              <div className="flex justify-center md:justify-end">
                <ConfidenceMeter value={result.confidence} size="lg" />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Reasoning panel */}
          <div className="p-4 md:p-6">
            <ReasoningPanel reasoning={result.reasoning} />
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Feedback widget */}
          <div className="p-4 md:p-6 bg-card/50">
            <FeedbackWidget
              classificationId={classificationId}
              productDescription={productDescription}
              suggestedCode={result.hsCode}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

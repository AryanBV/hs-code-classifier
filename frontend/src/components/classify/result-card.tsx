'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConfidenceMeter } from './confidence-meter'
import { FeedbackWidget } from './feedback-widget'
import { CheckCircle2, Sparkles, ChevronDown, ChevronUp, Lightbulb, Clock, Database, Copy, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'

interface AlternativeCode {
  code: string
  description: string
  confidence?: number
}

interface ClassificationResult {
  hsCode: string
  description: string
  confidence: number
  reasoning: string
  alternatives?: AlternativeCode[]
  clarificationImpact?: string
}

interface ResultCardProps {
  result: ClassificationResult
  classificationId: string
  productDescription: string
  processingTime?: number
}

export function ResultCard({ result, classificationId, productDescription, processingTime }: ResultCardProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [showReasoning, setShowReasoning] = useState(true)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-3xl mx-auto"
    >
      {/* Success indicator */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-2 mb-4"
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="text-sm font-medium text-emerald-400">Classification Complete</span>
      </motion.div>

      {/* Main result card */}
      <Card className="overflow-hidden border-0 bg-transparent">
        <CardContent className="p-0">
          {/* Hero section with HS Code */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="relative p-6 md:p-8 rounded-2xl overflow-hidden"
          >
            {/* Background effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-card/90 via-card/90 to-card/95 backdrop-blur-xl" />
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />

            {/* Border glow */}
            <div className="absolute inset-0 rounded-2xl border border-border" />
            <div className="absolute inset-0 rounded-2xl border border-primary/20" />

            {/* Content */}
            <div className="relative">
              {/* Badge */}
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20">
                <Sparkles className="w-3 h-3 mr-1.5" />
                HS Code Classification
              </Badge>

              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                {/* Code and description */}
                <div className="flex-1 min-w-0">
                  {/* HS Code display */}
                  <div className="flex items-center gap-3 mb-4">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="relative"
                    >
                      <span className="hs-code text-4xl md:text-5xl lg:text-6xl text-foreground">
                        {result.hsCode}
                      </span>
                      {/* Underline glow */}
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                        className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full origin-left"
                        style={{ boxShadow: '0 0 20px rgba(6, 182, 212, 0.5)' }}
                      />
                    </motion.div>

                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                      onClick={() => handleCopyCode(result.hsCode)}
                      className={cn(
                        'p-2 rounded-lg transition-all duration-200',
                        copiedCode === result.hsCode
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      )}
                    >
                      {copiedCode === result.hsCode ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </motion.button>
                  </div>

                  {/* Description */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-lg text-muted-foreground leading-relaxed max-w-xl"
                  >
                    {result.description}
                  </motion.p>
                </div>

                {/* Confidence meter */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex-shrink-0"
                >
                  <ConfidenceMeter value={result.confidence} size="lg" />
                </motion.div>
              </div>

              {/* Quick stats */}
              {processingTime && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="flex items-center gap-4 mt-6 pt-4 border-t border-border"
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{(processingTime / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="w-4 h-4" />
                    <span>10,468 codes analyzed</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>AI-powered</span>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Reasoning panel */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-4"
          >
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border hover:bg-muted/70 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                </div>
                <span className="font-medium text-foreground">Why this code?</span>
              </div>
              {showReasoning ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </button>

            <AnimatePresence>
              {showReasoning && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 mt-2 rounded-xl bg-muted/30 border border-border">
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {result.reasoning}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Alternatives panel */}
          {result.alternatives && result.alternatives.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-4"
            >
              <button
                onClick={() => setShowAlternatives(!showAlternatives)}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border hover:bg-muted/70 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-400">{result.alternatives.length}</span>
                  </div>
                  <span className="font-medium text-foreground">Alternative codes</span>
                </div>
                {showAlternatives ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              <AnimatePresence>
                {showAlternatives && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 mt-2">
                      {result.alternatives.map((alt, index) => (
                        <motion.div
                          key={alt.code}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border group hover:border-primary/30 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-lg font-semibold text-muted-foreground">
                              {alt.code}
                            </span>
                            <span className="text-sm text-muted-foreground/70 truncate">
                              {alt.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {alt.confidence && (
                              <Badge variant="outline" className="text-xs bg-muted/50">
                                {alt.confidence}%
                              </Badge>
                            )}
                            <button
                              onClick={() => handleCopyCode(alt.code)}
                              className={cn(
                                'p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all',
                                copiedCode === alt.code
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-muted text-muted-foreground hover:text-foreground'
                              )}
                            >
                              {copiedCode === alt.code ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Feedback widget */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="mt-6 p-4 rounded-xl bg-muted/30 border border-border"
          >
            <FeedbackWidget
              classificationId={classificationId}
              productDescription={productDescription}
              suggestedCode={result.hsCode}
            />
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

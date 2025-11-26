"use client"

import Link from "next/link"
import { Zap, Database, ArrowRight, Code2 } from "lucide-react"

/**
 * Home page - Main platform gateway
 *
 * Redesigned to showcase 3 main features:
 * 1. Smart Classification - AI-powered product classification
 * 2. Code Explorer - Browse and search 10,468 HS codes
 * 3. Compare Codes - Side-by-side comparison tool
 *
 * Also highlights the 3 classification methods:
 * - Keyword Matching (30%)
 * - Decision Trees (40%)
 * - AI Reasoning (30%)
 */
export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-6 md:py-12">
      {/* Hero Section - Updated for Platform Vision */}
      <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 md:mb-6">
          HS Code Classification & Explorer
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground mb-3">
          Fast AI-powered classification and comprehensive exploration of 10,468 HS codes
        </p>
        <p className="text-sm text-muted-foreground">
          85%+ accuracy • Smart discovery • Transparent reasoning
        </p>
      </div>

      {/* Feature Cards Section - Main Navigation */}
      <div className="max-w-6xl mx-auto mb-12 md:mb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Smart Classification */}
          <Link href="/classify">
            <div className="group h-full p-6 rounded-xl border border-border/50 bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Smart Classification</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Get instant HS code suggestions for your products. Our AI analyzes product descriptions and returns accurate classifications in seconds.
              </p>
              <div className="text-xs text-primary font-medium">Start classifying →</div>
            </div>
          </Link>

          {/* Card 2: Code Explorer */}
          <Link href="/explorer">
            <div className="group h-full p-6 rounded-xl border border-border/50 bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Database className="h-6 w-6 text-primary" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Code Explorer</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Browse and search through all 10,468 HS codes. Find related codes, view descriptions, and explore the complete HS code hierarchy.
              </p>
              <div className="text-xs text-primary font-medium">Explore codes →</div>
            </div>
          </Link>

          {/* Card 3: Compare Codes */}
          <Link href="/compare">
            <div className="group h-full p-6 rounded-xl border border-border/50 bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Code2 className="h-6 w-6 text-primary" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Compare Codes</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Compare multiple HS codes side-by-side to understand differences, similarities, and find the best match for your products.
              </p>
              <div className="text-xs text-primary font-medium">Compare codes →</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

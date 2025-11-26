"use client"

import Link from "next/link"
import { useState } from "react"
import { Menu, X, Search } from "lucide-react"

/**
 * Site header component with mobile-responsive navigation
 *
 * Features:
 * - Hamburger menu on mobile (<768px)
 * - Full horizontal navigation on desktop (≥768px)
 * - Global search bar (placeholder for Phase 2 implementation)
 * - Links to Classify, Explorer, Compare, History, About
 * - Smooth transitions and animations
 * - Touch-friendly tap targets (44px minimum)
 * - Auto-closes menu when navigation link is clicked
 */
export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        {/* Top Navigation Bar */}
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center space-x-2 flex-shrink-0"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="text-lg md:text-xl font-bold">
              HS Code Classifier
            </span>
          </Link>

          {/* Desktop Navigation - Center */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/classify"
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Classify
            </Link>
            <Link
              href="/explorer"
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Explorer
            </Link>
            <Link
              href="/compare"
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Compare
            </Link>
            <Link
              href="/history"
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              History
            </Link>
          </nav>

          {/* Desktop Search Bar - Right */}
          <div className="hidden md:flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search codes..."
                className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-border/50 bg-background focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 hover:bg-accent rounded-md transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Search Bar (shown below navigation) */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t">
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search codes..."
                className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-border/50 bg-background focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container mx-auto px-4 py-4 flex flex-col gap-1">
            <Link
              href="/classify"
              className="px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Classify
            </Link>
            <Link
              href="/explorer"
              className="px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Explorer
            </Link>
            <Link
              href="/compare"
              className="px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Compare
            </Link>
            <Link
              href="/history"
              className="px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              History
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}

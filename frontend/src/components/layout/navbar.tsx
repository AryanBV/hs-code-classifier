'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './theme-toggle'


export function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === '/'

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="container flex h-14 md:h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            TC
          </div>
          <span className="font-semibold text-lg hidden sm:inline-block group-hover:text-primary transition-colors">
            TradeCode
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          
          {isHome ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/classify">
                Start Classifying
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                Home
              </Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}

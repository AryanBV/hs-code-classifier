"use client"

import Link from "next/link"
import { ArrowLeft, Search, Loader, AlertCircle } from "lucide-react"
import { useState, useCallback } from "react"
import { searchCodes, ApiError } from "@/lib/api-client"

/**
 * Explorer Page - Browse and search all 10,468 HS codes
 *
 * Features:
 * - Real-time search functionality
 * - Search results with code info
 * - Find similar codes
 * - View code descriptions
 */
export default function ExplorerPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setHasSearched(false)
      setError(null)
      return
    }

    setIsSearching(true)
    setError(null)
    setHasSearched(true)

    try {
      const result = await searchCodes(query, 15)
      setSearchResults(result.results || [])
    } catch (err) {
      console.error('Search error:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to search codes. Please try again.')
      }
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)

    // Debounce search
    const timeoutId = setTimeout(() => {
      handleSearch(query)
    }, 300)

    return () => clearTimeout(timeoutId)
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-12">
      {/* Back Navigation */}
      <Link href="/">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 md:mb-8 cursor-pointer">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </div>
      </Link>

      {/* Page Header */}
      <div className="max-w-5xl mx-auto mb-8 md:mb-12">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3 md:mb-4">
          HS Code Explorer
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground">
          Search and explore all 10,468 HS codes. Find descriptions, related codes, and understand the classification hierarchy.
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-5xl mx-auto mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search codes by description (e.g., 'fresh vegetables', 'machinery', 'textiles')..."
            className="w-full pl-12 pr-4 py-3 rounded-lg border border-border/50 bg-background focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            value={searchQuery}
            onChange={handleSearchChange}
          />
          {isSearching && (
            <Loader className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground animate-spin" />
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-5xl mx-auto mb-8">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="max-w-5xl mx-auto">
        {hasSearched ? (
          <>
            {isSearching ? (
              <div className="text-center py-12">
                <Loader className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Searching codes...</p>
              </div>
            ) : searchResults.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground mb-6">
                  Found {searchResults.length} matching HS codes
                </p>
                <div className="space-y-3">
                  {searchResults.map((code: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-border/50 bg-card hover:border-primary/50 transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-sm font-mono font-semibold text-primary">
                            {code.hsCode || code.code}
                          </div>
                          <p className="text-sm text-foreground mt-1">
                            {code.description || code.name || 'No description available'}
                          </p>
                        </div>
                        {code.similarity && (
                          <div className="text-xs bg-primary/10 text-primary font-semibold px-3 py-1 rounded-full whitespace-nowrap ml-4">
                            {Math.round(code.similarity * 100)}% match
                          </div>
                        )}
                      </div>
                      {code.category && (
                        <p className="text-xs text-muted-foreground">
                          Category: {code.category}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-8 text-center">
                <p className="text-muted-foreground mb-2">No codes found matching "{searchQuery}"</p>
                <p className="text-xs text-muted-foreground">Try different keywords or browse our categories below</p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-12 text-center">
            <h2 className="text-xl font-bold mb-2">Start Exploring</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Use the search bar above to find HS codes by product description. Search across 10,468 codes and find the perfect match for your products.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">Examples to Search</h3>
                <p className="text-xs text-muted-foreground">Try "fresh fruit", "textiles", "machinery parts"</p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">Natural Language</h3>
                <p className="text-xs text-muted-foreground">Describe products in plain English</p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">Code Numbers</h3>
                <p className="text-xs text-muted-foreground">Search by exact code like "0804.50.10"</p>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="font-semibold mb-1 text-sm">Fast Results</h3>
                <p className="text-xs text-muted-foreground">Get matches instantly as you type</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="max-w-5xl mx-auto mt-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-lg border border-border/50 bg-muted/30">
            <div className="text-3xl font-bold text-primary mb-2">10,468</div>
            <h3 className="font-semibold mb-2">Total HS Codes</h3>
            <p className="text-sm text-muted-foreground">
              Comprehensive database of Harmonized System codes for all products
            </p>
          </div>
          <div className="p-6 rounded-lg border border-border/50 bg-muted/30">
            <div className="text-3xl font-bold text-primary mb-2">100%</div>
            <h3 className="font-semibold mb-2">Indexed</h3>
            <p className="text-sm text-muted-foreground">
              All codes have AI embeddings for fast semantic search and comparison
            </p>
          </div>
          <div className="p-6 rounded-lg border border-border/50 bg-muted/30">
            <div className="text-3xl font-bold text-primary mb-2">Instant</div>
            <h3 className="font-semibold mb-2">Results</h3>
            <p className="text-sm text-muted-foreground">
              Find related codes, categories, and similar classifications in seconds
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

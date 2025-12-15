'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

const examples = [
  'Brake pads for Toyota cars',
  'Cotton t-shirts for men',
  'LED light bulbs 12W',
  'Stainless steel kitchen knife',
]

interface ProductInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  disabled?: boolean
}

export function ProductInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled,
}: ProductInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [charCount, setCharCount] = useState(0)
  const maxChars = 1000
  const minChars = 10

  useEffect(() => {
    setCharCount(value.length)
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading && value.length >= minChars) {
      e.preventDefault()
      onSubmit()
    }
  }

  const handleExampleClick = (example: string) => {
    onChange(example)
    textareaRef.current?.focus()
  }

  const handleClear = () => {
    onChange('')
    textareaRef.current?.focus()
  }

  const isValid = charCount >= minChars && charCount <= maxChars

  return (
    <div className="space-y-4">
      {/* Input area */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your product... (e.g., 'Ceramic brake pads for passenger vehicles')"
          className="min-h-[140px] md:min-h-[160px] pr-10 text-base md:text-lg resize-none"
          disabled={isLoading || disabled}
        />
        {value && !isLoading && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Character count */}
      <div className="flex items-center justify-between text-sm">
        <span className={`${charCount < minChars ? 'text-muted-foreground' : charCount > maxChars ? 'text-destructive' : 'text-muted-foreground'}`}>
          {charCount < minChars
            ? `${minChars - charCount} more characters needed`
            : `${charCount} / ${maxChars} characters`
          }
        </span>
        {value && (
          <button
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Example chips */}
      {!value && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                onClick={() => handleExampleClick(example)}
                className="px-3 py-1.5 text-sm rounded-full border border-border bg-card hover:bg-accent hover:border-primary/50 transition-colors"
                disabled={isLoading}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Submit button */}
      <Button
        onClick={onSubmit}
        disabled={!isValid || isLoading || disabled}
        size="lg"
        className="w-full"
      >
        {isLoading ? 'Classifying...' : 'Classify Product'}
      </Button>
    </div>
  )
}

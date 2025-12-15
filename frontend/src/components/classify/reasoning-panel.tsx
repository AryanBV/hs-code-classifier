'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface ReasoningPanelProps {
  reasoning: string
}

export function ReasoningPanel({ reasoning }: ReasoningPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!reasoning) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 rounded-xl bg-card border border-border hover:bg-accent transition-colors">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <span className="font-medium">Why this code?</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="p-4 pt-3 text-sm text-muted-foreground leading-relaxed">
          {reasoning}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

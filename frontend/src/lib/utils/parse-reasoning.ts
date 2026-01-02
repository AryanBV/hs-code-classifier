/**
 * Parses the AI reasoning from various formats into a structured object
 */

export interface ParsedReasoning {
  chapter: {
    code: string
    name: string
  }
  heading: {
    code: string
    name: string
  }
  subheading?: {
    code: string
    name: string
  }
  finalCode: {
    code: string
    description: string
  }
  userSelections: Array<{
    question: string
    answer: string
  }>
  explanation?: string
}

export function parseReasoning(
  reasoning: string | object | undefined
): ParsedReasoning | null {
  if (!reasoning) return null

  try {
    // If it's a string, try to parse as JSON
    let parsed: Record<string, unknown>
    if (typeof reasoning === 'string') {
      // Check if it's JSON
      if (reasoning.trim().startsWith('{')) {
        parsed = JSON.parse(reasoning)
      } else {
        // It's a plain text explanation
        return {
          chapter: { code: '', name: '' },
          heading: { code: '', name: '' },
          finalCode: { code: '', description: '' },
          userSelections: [],
          explanation: reasoning,
        }
      }
    } else {
      parsed = reasoning as Record<string, unknown>
    }

    // Handle nested structure with chapter/heading/subheading
    const chapterData = parsed.chapter as Record<string, string> | undefined
    const headingData = parsed.heading as Record<string, string> | undefined
    const subheadingData = parsed.subheading as Record<string, string> | undefined
    const finalCodeData = parsed.finalCode as Record<string, string> | undefined

    // Extract structured data
    return {
      chapter: {
        code: chapterData?.code || '',
        name: chapterData?.name || (chapterData?.code ? `Chapter ${chapterData.code}` : ''),
      },
      heading: {
        code: headingData?.code || '',
        name: headingData?.name || (headingData?.code ? `Heading ${headingData.code}` : ''),
      },
      subheading: subheadingData?.code
        ? {
            code: subheadingData.code,
            name: subheadingData.name || `Subheading ${subheadingData.code}`,
          }
        : undefined,
      finalCode: {
        code: finalCodeData?.code || '',
        description: finalCodeData?.description || '',
      },
      userSelections: (parsed.userAnswers ||
        parsed.userSelections ||
        []) as ParsedReasoning['userSelections'],
      explanation: (parsed.explanation || parsed.summary) as string | undefined,
    }
  } catch (error) {
    console.error('Failed to parse reasoning:', error)
    return null
  }
}

/**
 * Generates a human-readable classification path from parsed reasoning
 */
export interface ClassificationPathNode {
  level: 'chapter' | 'heading' | 'subheading' | 'tariff'
  code: string
  description: string
  isActive: boolean
}

export function generateClassificationPath(
  reasoning: ParsedReasoning
): ClassificationPathNode[] {
  const path: ClassificationPathNode[] = []

  if (reasoning.chapter.code) {
    path.push({
      level: 'chapter',
      code: reasoning.chapter.code,
      description: reasoning.chapter.name,
      isActive: false,
    })
  }

  if (reasoning.heading.code) {
    path.push({
      level: 'heading',
      code: reasoning.heading.code,
      description: reasoning.heading.name,
      isActive: false,
    })
  }

  if (reasoning.subheading?.code) {
    path.push({
      level: 'subheading',
      code: reasoning.subheading.code,
      description: reasoning.subheading.name,
      isActive: false,
    })
  }

  if (reasoning.finalCode.code) {
    path.push({
      level: 'tariff',
      code: reasoning.finalCode.code,
      description: reasoning.finalCode.description,
      isActive: true,
    })
  }

  return path
}

/**
 * Extract classification path from HS code when parsed reasoning is not available
 */
export function generatePathFromHsCode(
  hsCode: string,
  description: string
): ClassificationPathNode[] {
  const path: ClassificationPathNode[] = []

  // Remove dots for parsing
  const cleanCode = hsCode.replace(/\./g, '')

  // Chapter (first 2 digits)
  if (cleanCode.length >= 2) {
    path.push({
      level: 'chapter',
      code: cleanCode.substring(0, 2),
      description: `Chapter ${cleanCode.substring(0, 2)}`,
      isActive: false,
    })
  }

  // Heading (first 4 digits)
  if (cleanCode.length >= 4) {
    path.push({
      level: 'heading',
      code: `${cleanCode.substring(0, 2)}${cleanCode.substring(2, 4)}`,
      description: `Heading ${cleanCode.substring(0, 4)}`,
      isActive: false,
    })
  }

  // Subheading (first 6 digits)
  if (cleanCode.length >= 6) {
    path.push({
      level: 'subheading',
      code: `${cleanCode.substring(0, 4)}.${cleanCode.substring(4, 6)}`,
      description: `Subheading ${cleanCode.substring(0, 4)}.${cleanCode.substring(4, 6)}`,
      isActive: false,
    })
  }

  // Full tariff code
  path.push({
    level: 'tariff',
    code: hsCode,
    description: description,
    isActive: true,
  })

  return path
}

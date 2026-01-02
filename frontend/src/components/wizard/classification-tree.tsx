'use client'

import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { ClassificationPathNode } from '@/lib/utils/parse-reasoning'

interface ClassificationTreeProps {
  path: ClassificationPathNode[]
}

const levelLabels: Record<ClassificationPathNode['level'], string> = {
  chapter: 'Chapter',
  heading: 'Heading',
  subheading: 'Subheading',
  tariff: 'Tariff Item',
}

const levelColors: Record<ClassificationPathNode['level'], string> = {
  chapter: 'text-blue-500 dark:text-blue-400',
  heading: 'text-purple-500 dark:text-purple-400',
  subheading: 'text-amber-500 dark:text-amber-400',
  tariff: 'text-emerald-500 dark:text-emerald-400',
}

// Clean description text - same logic as hs-code-display.tsx
const cleanDescription = (description: string) => {
  return description
    .replace(/^[-:\s]+/, '')
    .replace(/:\s*-\s*-?\s*/g, ' - ')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/-\s+emitting/gi, '-emitting')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function ClassificationTree({ path }: ClassificationTreeProps) {
  if (path.length === 0) return null

  return (
    <div className="space-y-1">
      {path.map((node, index) => (
        <motion.div
          key={node.code}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1, duration: 0.3 }}
          className="flex items-start"
        >
          {/* Indentation and connector */}
          <div
            className="flex items-center flex-shrink-0"
            style={{ width: `${index * 24}px` }}
          >
            {index > 0 && (
              <div className="w-full flex items-center justify-end pr-2">
                <div className="w-4 h-px bg-slate-300 dark:bg-slate-600" />
                <div className="w-2 h-2 border-l-2 border-b-2 border-slate-300 dark:border-slate-600 rounded-bl" />
              </div>
            )}
          </div>

          {/* Node content */}
          <div
            className={`
              flex-1 p-2 rounded-lg min-w-0
              ${
                node.isActive
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }
            `}
          >
            {node.isActive ? (
              /* Two-line layout for active (final) node to prevent overflow */
              <div className="flex flex-col gap-1">
                {/* Row 1: Level badge + Code + Check icon */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                    {levelLabels[node.level]}
                  </span>
                  <span className={`font-mono font-semibold ${levelColors[node.level]}`}>
                    {node.code}
                  </span>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 ml-auto" />
                </div>

                {/* Row 2: Description (full width, wrapped) */}
                <p className="text-sm text-slate-900 dark:text-white font-medium pl-1 break-words">
                  {cleanDescription(node.description)}
                </p>
              </div>
            ) : (
              /* Single-line layout for non-active nodes */
              <div className="flex items-center gap-3">
                {/* Level badge */}
                <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {levelLabels[node.level]}
                </span>

                {/* Code */}
                <span className={`font-mono font-semibold flex-shrink-0 ${levelColors[node.level]}`}>
                  {node.code}
                </span>

                {/* Description */}
                <span className="flex-1 text-sm truncate text-slate-600 dark:text-slate-400">
                  {cleanDescription(node.description)}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

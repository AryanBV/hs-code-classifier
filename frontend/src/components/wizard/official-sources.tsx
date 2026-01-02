'use client'

import { motion } from 'framer-motion'
import { ExternalLink, Shield } from 'lucide-react'

interface OfficialSourcesProps {
  hsCode: string
}

export function OfficialSources({ hsCode: _hsCode }: OfficialSourcesProps) {
  // hsCode prop available for future targeted links to specific chapters
  const sources = [
    {
      name: 'CBIC Tariff',
      flag: '\u{1F1EE}\u{1F1F3}', // India flag
      url: `https://www.cbic.gov.in/htdocs-cbec/customs/cst2022-300622/cst-idx`,
      description: 'Official Indian Customs Tariff',
    },
    {
      name: 'WCO HS Database',
      flag: '\u{1F310}', // Globe
      url: `https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx`,
      description: 'World Customs Organization',
    },
    {
      name: 'ITC HS Codes',
      flag: '\u{1F4D6}', // Book
      url: `https://www.dgft.gov.in/CP/?opt=itc-hs-code`,
      description: 'DGFT ITC-HS Classification',
    },
  ]

  return (
    <motion.div
      className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.3 }}
    >
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <Shield className="w-4 h-4 text-blue-500" />
          <span className="font-medium">Verify on Official Sources</span>
        </div>
      </div>

      <div className="p-3 grid grid-cols-3 gap-2">
        {sources.map((source, index) => (
          <motion.a
            key={source.name}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 + index * 0.1, duration: 0.2 }}
            className="flex flex-col items-center gap-1 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-center group"
          >
            <span className="text-xl">{source.flag}</span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors flex items-center gap-1">
              {source.name}
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </motion.a>
        ))}
      </div>
    </motion.div>
  )
}

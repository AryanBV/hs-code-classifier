'use client'

import { motion } from 'framer-motion'
import { Hash, Calendar, TrendingUp, BookOpen } from 'lucide-react'
import type { HistoryStats as HistoryStatsType } from '@/lib/hooks/use-history'
import { cn } from '@/lib/cn'

interface HistoryStatsProps {
  stats: HistoryStatsType
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  color: 'cyan' | 'emerald' | 'amber' | 'purple'
  delay: number
}

function StatCard({ icon: Icon, label, value, color, delay }: StatCardProps) {
  const colorClasses = {
    cyan: {
      bg: 'bg-cyan-100 dark:bg-cyan-500/20',
      icon: 'text-cyan-600 dark:text-cyan-400',
      border: 'border-cyan-200 dark:border-cyan-500/30',
    },
    emerald: {
      bg: 'bg-emerald-100 dark:bg-emerald-500/20',
      icon: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-500/30',
    },
    amber: {
      bg: 'bg-amber-100 dark:bg-amber-500/20',
      icon: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-500/30',
    },
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-500/20',
      icon: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-200 dark:border-purple-500/30',
    },
  }

  const colors = colorClasses[color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={cn(
        'p-4 rounded-xl border',
        'bg-white dark:bg-slate-800/50',
        'border-slate-200 dark:border-slate-700',
        'hover:border-slate-300 dark:hover:border-slate-600',
        'transition-colors duration-200'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-lg', colors.bg)}>
          <Icon className={cn('w-5 h-5', colors.icon)} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

export function HistoryStats({ stats }: HistoryStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={Hash}
        label="Total"
        value={stats.total}
        color="cyan"
        delay={0}
      />
      <StatCard
        icon={Calendar}
        label="This Week"
        value={stats.thisWeek}
        color="emerald"
        delay={0.05}
      />
      <StatCard
        icon={TrendingUp}
        label="Avg Confidence"
        value={`${stats.averageConfidence}%`}
        color="amber"
        delay={0.1}
      />
      <StatCard
        icon={BookOpen}
        label="Most Common"
        value={stats.mostCommonChapter}
        color="purple"
        delay={0.15}
      />
    </div>
  )
}

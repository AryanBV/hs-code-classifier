'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  MessageSquare,
  GitBranch,
  Layers,
  ChevronRight,
  ChevronDown,
  Copy,
  CheckCircle2,
  Sparkles,
  Zap,
  ListTree,
  User,
  Bot
} from 'lucide-react'
import { cn } from '@/lib/cn'

// Types for the enhanced history item
export interface ConversationTurn {
  question: string
  answer: string
}

export interface AlternativeCode {
  code: string
  description: string
  confidence?: number
}

export interface ClassificationPath {
  chapter: { code: string; name: string }
  heading: { code: string; name: string }
  finalCode: { code: string; description: string }
  userAnswers: ConversationTurn[]
}

export interface EnhancedHistoryItem {
  id: string
  productDescription: string
  hsCode: string
  description: string
  confidence: number
  reasoning: string // JSON string or plain text
  timestamp: number
  alternatives?: AlternativeCode[]
  clarificationImpact?: string
  processingTimeMs?: number
  totalRounds?: number
  questionsAsked?: number
}

interface HistoryDetailViewProps {
  item: EnhancedHistoryItem
  onClose?: () => void
}

// Parse reasoning to get classification path
function parseClassificationPath(reasoning: string): ClassificationPath | null {
  try {
    const parsed = JSON.parse(reasoning)
    if (parsed.chapter && parsed.finalCode) {
      return parsed as ClassificationPath
    }
    return null
  } catch {
    return null
  }
}

// Copy button component
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1.5 rounded-md transition-all duration-200',
        copied
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60',
        className
      )}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// Section component with collapsible functionality
function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  badge,
  delay = 0
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string | number
  delay?: number
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className="relative"
    >
      {/* Decorative line connector */}
      <div className="absolute left-6 top-14 bottom-0 w-px bg-gradient-to-b from-cyan-500/20 to-transparent" />

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 group"
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center group-hover:border-cyan-500/40 transition-colors">
          <Icon className="w-5 h-5 text-cyan-400" />
        </div>
        <span className="flex-1 text-left font-medium text-white/90">{title}</span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-mono text-cyan-400">
            {badge}
          </span>
        )}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-white/40" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3 pl-6 pr-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Classification Path Visualization
function ClassificationPathView({ path }: { path: ClassificationPath }) {
  const nodes = [
    { code: `Ch. ${path.chapter.code}`, label: path.chapter.name, type: 'chapter' },
    { code: path.heading.code, label: `Heading ${path.heading.code}`, type: 'heading' },
    { code: path.finalCode.code, label: path.finalCode.description, type: 'final' }
  ]

  return (
    <div className="relative p-4 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06]">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(6, 182, 212, 0.15) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }} />
      </div>

      <div className="relative flex flex-wrap items-center gap-2">
        {nodes.map((node, idx) => (
          <div key={node.code} className="flex items-center gap-2">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: idx * 0.15, duration: 0.4, type: 'spring' }}
              className={cn(
                'relative px-3 py-2 rounded-lg border backdrop-blur-sm',
                node.type === 'final'
                  ? 'bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border-emerald-500/30'
                  : node.type === 'chapter'
                  ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20'
                  : 'bg-white/[0.03] border-white/10'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'font-mono text-sm font-semibold',
                  node.type === 'final' ? 'text-emerald-400' : 'text-cyan-400'
                )}>
                  {node.code}
                </span>
                {node.type === 'final' && <CopyButton text={node.code} />}
              </div>
              <p className="text-xs text-white/50 mt-0.5 max-w-[200px] truncate">
                {node.label}
              </p>
              {node.type === 'final' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: 'spring' }}
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a0f]"
                />
              )}
            </motion.div>

            {idx < nodes.length - 1 && (
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ delay: idx * 0.15 + 0.1, duration: 0.3 }}
              >
                <ChevronRight className="w-4 h-4 text-white/20" />
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Conversation Timeline
function ConversationTimeline({ turns }: { turns: ConversationTurn[] }) {
  return (
    <div className="space-y-3">
      {turns.map((turn, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.1, duration: 0.4 }}
          className="relative"
        >
          {/* Timeline connector */}
          {idx < turns.length - 1 && (
            <div className="absolute left-5 top-12 bottom-0 w-px bg-gradient-to-b from-cyan-500/30 to-cyan-500/10" />
          )}

          {/* Question */}
          <div className="flex gap-3 mb-2">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
              <Bot className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 p-3 rounded-xl rounded-tl-sm bg-white/[0.03] border border-white/[0.06]">
              <p className="text-sm text-white/70">{turn.question}</p>
            </div>
          </div>

          {/* Answer */}
          <div className="flex gap-3 pl-6">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
              <User className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 p-3 rounded-xl rounded-tl-sm bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
              <p className="text-sm font-medium text-emerald-300">{turn.answer}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// Alternative Codes List
function AlternativesList({ alternatives }: { alternatives: AlternativeCode[] }) {
  return (
    <div className="space-y-2">
      {alternatives.map((alt, idx) => (
        <motion.div
          key={alt.code}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.3 }}
          className="group flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-semibold text-white/70 group-hover:text-cyan-400 transition-colors">
              {alt.code}
            </span>
            <span className="text-sm text-white/40 truncate">
              {alt.description}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {alt.confidence && (
              <span className="text-xs font-mono text-white/30">
                {alt.confidence}%
              </span>
            )}
            <CopyButton text={alt.code} className="opacity-0 group-hover:opacity-100" />
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// Stats Card
function StatsCard({
  icon: Icon,
  label,
  value
}: {
  icon: React.ElementType
  label: string
  value: string | number
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
      <div className="w-8 h-8 rounded-md bg-cyan-500/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-cyan-400" />
      </div>
      <div>
        <p className="text-xs text-white/40">{label}</p>
        <p className="text-sm font-medium text-white/80">{value}</p>
      </div>
    </div>
  )
}

// Main Component
export function HistoryDetailView({ item }: HistoryDetailViewProps) {
  const classificationPath = parseClassificationPath(item.reasoning)
  const hasConversation = classificationPath?.userAnswers && classificationPath.userAnswers.length > 0
  const hasAlternatives = item.alternatives && item.alternatives.length > 0

  return (
    <div className="space-y-4">
      {/* Header with main result */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.08] p-6"
      >
        {/* Background effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          {/* Product description */}
          <div className="flex items-start gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-cyan-400 mt-1 flex-shrink-0" />
            <p className="text-white/60 text-sm leading-relaxed">
              {item.productDescription}
            </p>
          </div>

          {/* Main HS Code */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-3xl md:text-4xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                {item.hsCode}
              </span>
              <CopyButton text={item.hsCode} />
            </div>

            {/* Confidence */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-400">{item.confidence}%</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-white/50 text-sm mb-4">{item.description}</p>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatsCard
              icon={Clock}
              label="Processing"
              value={item.processingTimeMs ? `${(item.processingTimeMs / 1000).toFixed(1)}s` : 'N/A'}
            />
            <StatsCard
              icon={MessageSquare}
              label="Questions"
              value={item.questionsAsked || classificationPath?.userAnswers?.length || 0}
            />
            <StatsCard
              icon={GitBranch}
              label="Rounds"
              value={item.totalRounds || 1}
            />
            <StatsCard
              icon={Layers}
              label="Alternatives"
              value={item.alternatives?.length || 0}
            />
          </div>

          {/* Clarification impact */}
          {item.clarificationImpact && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10"
            >
              <Zap className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-cyan-300/70">{item.clarificationImpact}</p>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Classification Path */}
      {classificationPath && (
        <Section
          title="Classification Path"
          icon={ListTree}
          delay={0.1}
        >
          <ClassificationPathView path={classificationPath} />
        </Section>
      )}

      {/* Conversation Flow */}
      {hasConversation && (
        <Section
          title="Classification Journey"
          icon={MessageSquare}
          badge={classificationPath?.userAnswers.length}
          delay={0.2}
        >
          <ConversationTimeline turns={classificationPath!.userAnswers} />
        </Section>
      )}

      {/* Alternative Codes */}
      {hasAlternatives && (
        <Section
          title="Alternative Codes"
          icon={Layers}
          badge={item.alternatives!.length}
          defaultOpen={false}
          delay={0.3}
        >
          <AlternativesList alternatives={item.alternatives!} />
        </Section>
      )}

      {/* Legacy reasoning fallback */}
      {!classificationPath && item.reasoning && (
        <Section
          title="Classification Reasoning"
          icon={Sparkles}
          delay={0.2}
        >
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
              {item.reasoning}
            </p>
          </div>
        </Section>
      )}
    </div>
  )
}

export default HistoryDetailView

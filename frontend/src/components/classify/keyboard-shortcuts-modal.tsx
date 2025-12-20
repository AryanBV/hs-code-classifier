'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Keyboard, Command, ArrowUp, ArrowDown, CornerDownLeft, Search, RotateCcw, History, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutGroup {
  title: string
  shortcuts: {
    keys: string[]
    description: string
    icon?: React.ReactNode
  }[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Input & Navigation',
    shortcuts: [
      {
        keys: ['Enter'],
        description: 'Send message / Submit',
        icon: <CornerDownLeft className="w-4 h-4" />,
      },
      {
        keys: ['Shift', 'Enter'],
        description: 'New line in input',
      },
      {
        keys: ['↑'],
        description: 'Edit last message',
        icon: <ArrowUp className="w-4 h-4" />,
      },
      {
        keys: ['Esc'],
        description: 'Clear input / Close modal',
      },
    ],
  },
  {
    title: 'Quick Actions',
    shortcuts: [
      {
        keys: ['Ctrl', 'K'],
        description: 'Focus search / New classification',
        icon: <Search className="w-4 h-4" />,
      },
      {
        keys: ['Ctrl', 'R'],
        description: 'Reset conversation',
        icon: <RotateCcw className="w-4 h-4" />,
      },
      {
        keys: ['Ctrl', 'H'],
        description: 'Toggle history sidebar',
        icon: <History className="w-4 h-4" />,
      },
      {
        keys: ['?'],
        description: 'Show this help',
        icon: <HelpCircle className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'Results',
    shortcuts: [
      {
        keys: ['Ctrl', 'C'],
        description: 'Copy HS code to clipboard',
      },
      {
        keys: ['Tab'],
        description: 'Navigate between sections',
      },
      {
        keys: ['1', '2', '3'],
        description: 'Select option (during questions)',
      },
    ],
  },
]

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div className="w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-2xl shadow-elevated overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                    <Keyboard className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
                    <p className="text-xs text-slate-500">Navigate faster with shortcuts</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <div className="space-y-6">
                  {shortcutGroups.map((group, groupIndex) => (
                    <motion.div
                      key={group.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: groupIndex * 0.1 }}
                    >
                      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                        {group.title}
                      </h3>
                      <div className="space-y-2">
                        {group.shortcuts.map((shortcut, index) => (
                          <motion.div
                            key={shortcut.description}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: groupIndex * 0.1 + index * 0.05 }}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 hover:border-slate-600/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {shortcut.icon && (
                                <span className="text-slate-500">
                                  {shortcut.icon}
                                </span>
                              )}
                              <span className="text-sm text-slate-300">
                                {shortcut.description}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {shortcut.keys.map((key, keyIndex) => (
                                <span key={keyIndex}>
                                  <kbd
                                    className={cn(
                                      'inline-flex items-center justify-center min-w-[28px] px-2 py-1 text-xs font-mono rounded-md',
                                      'bg-slate-700 text-slate-300 border border-slate-600',
                                      'shadow-[0_2px_0_0_rgba(0,0,0,0.3)]'
                                    )}
                                  >
                                    {key === 'Ctrl' ? (
                                      <span className="flex items-center gap-0.5">
                                        <Command className="w-3 h-3" />
                                      </span>
                                    ) : key === '↑' ? (
                                      <ArrowUp className="w-3 h-3" />
                                    ) : key === '↓' ? (
                                      <ArrowDown className="w-3 h-3" />
                                    ) : (
                                      key
                                    )}
                                  </kbd>
                                  {keyIndex < shortcut.keys.length - 1 && (
                                    <span className="mx-1 text-slate-600">+</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono">?</kbd> anytime to toggle</span>
                  <span>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono">Esc</kbd> to close</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Hook for keyboard shortcuts
export function useKeyboardShortcuts(handlers: {
  onNewClassification?: () => void
  onResetConversation?: () => void
  onToggleHistory?: () => void
  onShowHelp?: () => void
  onCopyCode?: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        // Only handle Escape in inputs
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur()
        }
        return
      }

      // Ctrl/Cmd + K - New classification
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        handlers.onNewClassification?.()
      }

      // Ctrl/Cmd + R - Reset conversation
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        handlers.onResetConversation?.()
      }

      // Ctrl/Cmd + H - Toggle history
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        handlers.onToggleHistory?.()
      }

      // ? - Show help
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        handlers.onShowHelp?.()
      }

      // Ctrl/Cmd + C - Copy code (when not selecting text)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selection = window.getSelection()
        if (!selection || selection.toString().length === 0) {
          handlers.onCopyCode?.()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}

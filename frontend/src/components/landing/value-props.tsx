'use client'

import { Clock, ShieldCheck, MessageSquareText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const valueProps = [
  {
    icon: Clock,
    title: 'Save Hours',
    description: 'What used to take 30+ minutes of manual research now takes seconds. Focus on growing your business, not paperwork.',
  },
  {
    icon: ShieldCheck,
    title: 'Reduce Errors',
    description: 'AI-powered precision means fewer costly mistakes. Get the right code the first time with high confidence scores.',
  },
  {
    icon: MessageSquareText,
    title: 'Understand Why',
    description: 'Every classification comes with clear reasoning. Know exactly why a code was selected — no black boxes.',
  },
]

export function ValueProps() {
  return (
    <section className="py-16 md:py-24 bg-card/30">
      <div className="container">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why TradeCode?
          </h2>
          <p className="text-muted-foreground text-lg">
            Built for exporters who value accuracy, speed, and transparency
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {valueProps.map((prop) => (
            <Card
              key={prop.title}
              className="group hover:border-primary/50 hover:shadow-glow transition-all duration-300"
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary mb-5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <prop.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  {prop.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {prop.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

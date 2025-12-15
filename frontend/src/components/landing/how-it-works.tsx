'use client'

import { FileText, Search, CheckCircle } from 'lucide-react'

const steps = [
  {
    icon: FileText,
    step: '01',
    title: 'Describe Your Product',
    description: 'Enter a natural language description of your product. Be as specific as you want.',
  },
  {
    icon: Search,
    step: '02',
    title: 'AI Analyzes',
    description: 'Our AI searches through 10,468 HS codes using advanced semantic understanding.',
  },
  {
    icon: CheckCircle,
    step: '03',
    title: 'Get Your Code',
    description: 'Receive the most accurate HS code with confidence score and detailed reasoning.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 md:py-24">
      <div className="container">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground text-lg">
            Three simple steps to get your HS code classification
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, index) => (
            <div key={step.step} className="relative">
              {/* Connector line (hidden on mobile, shown on md+) */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-full h-[2px] bg-gradient-to-r from-primary/50 to-transparent" />
              )}

              <div className="flex flex-col items-center text-center">
                {/* Icon container */}
                <div className="relative mb-6">
                  <div className="flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-card border border-border shadow-lg">
                    <step.icon className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                  </div>
                  {/* Step number badge */}
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {step.step}
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

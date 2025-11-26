"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

/**
 * Props for ClassificationForm component
 */
interface ClassificationFormProps {
  onSubmit: (data: FormData) => void
  isLoading: boolean
}

/**
 * Form data structure
 */
interface FormData {
  productDescription: string
  destinationCountry: string
  questionnaireAnswers?: Record<string, any>
}

/**
 * Mobile-first classification form component
 *
 * Features:
 * - Responsive design (mobile → tablet → desktop)
 * - Character counter with validation
 * - Touch-friendly buttons (min 44px height)
 * - Loading states with spinner
 * - Auto-growing textarea
 * - Real-time character count
 *
 * Mobile optimizations:
 * - Single column layout
 * - Large touch targets
 * - Clear visual hierarchy
 * - 16px base font (prevents iOS zoom)
 */
export function ClassificationForm({ onSubmit, isLoading }: ClassificationFormProps) {
  const [formData, setFormData] = useState<FormData>({
    productDescription: "",
    destinationCountry: "IN",
    questionnaireAnswers: {}
  })

  const MIN_CHARS = 20
  const MAX_CHARS = 1000
  const charCount = formData.productDescription.length
  const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValid && !isLoading) {
      onSubmit(formData)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleClear = () => {
    setFormData({
      productDescription: "",
      destinationCountry: "IN",
      questionnaireAnswers: {}
    })
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 lg:p-8">
        {/* Form Header */}
        <div className="mb-6 md:mb-8">
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            Classify Your Product
          </h2>
          <p className="text-sm text-muted-foreground">
            Provide detailed product information for accurate HS code classification
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6">
          {/* Step 1: Product Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="block text-sm font-medium">
              Product Description
              <span className="text-destructive ml-1">*</span>
            </label>
            <textarea
              id="description"
              placeholder="E.g., Ceramic brake pads for motorcycles, finished product, 60% ceramic composite, suitable for high-performance bikes..."
              rows={6}
              className="w-full px-3 md:px-4 py-3 text-base border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              value={formData.productDescription}
              onChange={(e) => handleInputChange('productDescription', e.target.value)}
              required
              disabled={isLoading}
              maxLength={MAX_CHARS}
            />

            {/* Character Counter */}
            <div className="flex items-center justify-between text-xs">
              <p className="text-muted-foreground">
                Include: material, function, condition, composition, intended use
              </p>
              <div className={`font-medium ${
                charCount < MIN_CHARS
                  ? 'text-muted-foreground'
                  : charCount > MAX_CHARS * 0.9
                    ? 'text-orange-600'
                    : 'text-green-600'
              }`}>
                {charCount}/{MAX_CHARS}
              </div>
            </div>

            {/* Validation message */}
            {charCount > 0 && charCount < MIN_CHARS && (
              <p className="text-xs text-orange-600 flex items-center gap-1">
                <span className="inline-block w-1 h-1 bg-orange-600 rounded-full"></span>
                Please provide at least {MIN_CHARS} characters for accurate classification
              </p>
            )}
          </div>

          {/* Step 2: Destination Country */}
          <div className="space-y-2">
            <label htmlFor="country" className="block text-sm font-medium">
              Destination Country
            </label>
            <select
              id="country"
              className="w-full px-3 md:px-4 py-3 text-base border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              value={formData.destinationCountry}
              onChange={(e) => handleInputChange('destinationCountry', e.target.value)}
              disabled={isLoading}
            >
              <option value="IN">India (Export)</option>
              <option value="USA">United States</option>
              <option value="EU">European Union</option>
              <option value="UK">United Kingdom</option>
              <option value="UAE">UAE</option>
            </select>
            <p className="text-xs text-muted-foreground">
              We'll map the Indian HS code to your destination country's tariff code
            </p>
          </div>

          {/* Action Buttons - Mobile Optimized */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 md:pt-6">
            {/* Clear Button */}
            <button
              type="button"
              className="w-full sm:w-auto min-h-[44px] px-5 md:px-6 py-2.5 border border-input rounded-md bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              disabled={isLoading}
              onClick={handleClear}
            >
              Clear Form
            </button>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full sm:w-auto min-h-[44px] px-6 md:px-8 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center justify-center gap-2"
              disabled={isLoading || !isValid}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Classifying...</span>
                </>
              ) : (
                'Classify Product'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

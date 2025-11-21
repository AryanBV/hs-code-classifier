"use client"

import { useState } from "react"

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
 * Multi-step classification form
 *
 * Step 1: Product description
 * Step 2: Destination country
 * Step 3: Smart questionnaire (dynamic based on category)
 *
 * TODO: Implement in Phase 2
 * - Add form validation
 * - Add step navigation
 * - Implement dynamic questionnaire
 * - Add loading states
 */
export function ClassificationForm({ onSubmit, isLoading }: ClassificationFormProps) {
  const [formData, setFormData] = useState<FormData>({
    productDescription: "",
    destinationCountry: "USA",
    questionnaireAnswers: {}
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-card border rounded-lg p-6 md:p-8">
        <h2 className="text-2xl font-semibold mb-6">
          Classify Your Product
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Product Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Product Description
              <span className="text-destructive ml-1">*</span>
            </label>
            <textarea
              id="description"
              placeholder="E.g., Ceramic brake pads for motorcycles, finished product, 60% ceramic composite..."
              rows={5}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              value={formData.productDescription}
              onChange={(e) => handleInputChange('productDescription', e.target.value)}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Be as detailed as possible: material, function, condition (finished/raw)
            </p>
          </div>

          {/* Step 2: Destination Country */}
          <div className="space-y-2">
            <label htmlFor="country" className="text-sm font-medium">
              Destination Country
            </label>
            <select
              id="country"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              value={formData.destinationCountry}
              onChange={(e) => handleInputChange('destinationCountry', e.target.value)}
              disabled={isLoading}
            >
              <option value="USA">United States</option>
              <option value="EU">European Union</option>
              <option value="UK">United Kingdom</option>
              <option value="UAE">UAE</option>
              <option value="IN">India (Export)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              We'll map the Indian HS code to your destination country's code
            </p>
          </div>

          {/* TODO: Step 3: Smart Questionnaire (Phase 2) */}
          {/* This will be dynamically generated based on detected category */}

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              className="px-6 py-2 border rounded-md hover:bg-accent transition-colors"
              disabled={isLoading}
              onClick={() => setFormData({
                productDescription: "",
                destinationCountry: "USA",
                questionnaireAnswers: {}
              })}
            >
              Clear
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={isLoading || !formData.productDescription.trim()}
            >
              {isLoading ? 'Classifying...' : 'Classify Product'}
            </button>
          </div>
        </form>

        {/* Progress indicator (for multi-step) */}
        {/* TODO: Add in Phase 2 when questionnaire is implemented */}
      </div>

      {/* Helper text */}
      <div className="mt-6 text-center text-sm text-muted-foreground">
        <p>
          Classification typically takes 10-30 seconds
        </p>
      </div>
    </div>
  )
}

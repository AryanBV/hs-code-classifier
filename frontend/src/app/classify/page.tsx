'use client'

import { WizardContainer } from '@/components/wizard'

/**
 * Classification Page
 *
 * Wizard-based HS code classification flow.
 * Screens: Input -> Questions -> Result
 *
 * All state management and screen transitions handled by WizardContainer.
 */
export default function ClassifyPage() {
  return <WizardContainer />
}

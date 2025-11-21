/**
 * API Client for Backend Communication
 *
 * Centralized API calls to backend server
 * Handles error handling, retries, and response parsing
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

/**
 * Classification request payload
 */
export interface ClassifyRequest {
  productDescription: string
  destinationCountry?: string
  questionnaireAnswers?: Record<string, any>
}

/**
 * Classification response
 */
export interface ClassifyResponse {
  success: boolean
  results: ClassificationResult[]
  classificationId: string
  timestamp: string
}

/**
 * Individual classification result
 */
export interface ClassificationResult {
  hsCode: string
  description: string
  confidence: number
  reasoning: string
  countryMapping?: {
    india: string
    destination?: string
    destinationCountry?: string
    importDuty?: string
    specialRequirements?: string
  }
}

/**
 * Feedback request payload
 */
export interface FeedbackRequest {
  classificationId: string
  feedback: 'correct' | 'incorrect' | 'unsure'
  correctedCode?: string
}

/**
 * API Error
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(
        data.message || 'API request failed',
        response.status,
        data
      )
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    // Network error or JSON parse error
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0
    )
  }
}

/**
 * Classify a product
 *
 * @param request - Classification request data
 * @returns Classification results
 *
 * TODO: Implement in Phase 2
 */
export async function classifyProduct(
  request: ClassifyRequest
): Promise<ClassifyResponse> {
  return fetchAPI<ClassifyResponse>('/api/classify', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/**
 * Submit feedback on a classification
 *
 * @param request - Feedback data
 * @returns Success response
 *
 * TODO: Implement in Phase 2
 */
export async function submitFeedback(
  request: FeedbackRequest
): Promise<{ success: boolean; message: string }> {
  return fetchAPI('/api/feedback', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/**
 * Get classification history for a session
 *
 * @param sessionId - Session identifier
 * @param limit - Number of results to return (default: 10)
 * @returns Array of past classifications
 *
 * TODO: Implement in Phase 2
 */
export async function getClassificationHistory(
  sessionId: string,
  limit: number = 10
): Promise<{ history: any[]; count: number }> {
  return fetchAPI(`/api/history?sessionId=${sessionId}&limit=${limit}`)
}

/**
 * Get available product categories
 *
 * @returns List of available categories
 *
 * TODO: Implement in Phase 2
 */
export async function getCategories(): Promise<{ categories: any[] }> {
  return fetchAPI('/api/categories')
}

/**
 * Health check
 *
 * @returns Server health status
 */
export async function healthCheck(): Promise<{ status: string; message: string }> {
  return fetchAPI('/health')
}

/**
 * Generate or retrieve session ID
 * Stored in localStorage for history tracking
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  let sessionId = localStorage.getItem('hs_classifier_session_id')

  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`
    localStorage.setItem('hs_classifier_session_id', sessionId)
  }

  return sessionId
}

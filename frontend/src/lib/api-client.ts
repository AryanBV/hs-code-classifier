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
  productDescription: string
  suggestedCode: string
  rating: number
  feedback: 'correct' | 'incorrect' | 'unsure'
  correctedCode?: string
}

// ========================================
// Conversational Classification Types
// ========================================

/**
 * Request for conversational classification
 */
export interface ConversationalClassifyRequest {
  productDescription: string
  conversationId?: string
  sessionId: string
  answers?: Record<string, string>
}

/**
 * Response from conversational classification
 */
export interface ConversationalClassifyResponse {
  success: boolean
  conversationId: string
  responseType: 'questions' | 'classification'

  // If questions
  questions?: ClarifyingQuestion[]
  questionContext?: string
  roundNumber?: number
  totalQuestionsAsked?: number

  // If classification
  result?: ConversationalResult
  conversationSummary?: ConversationSummary

  timestamp: string
  error?: string
}

/**
 * A clarifying question from the LLM
 */
export interface ClarifyingQuestion {
  id: string
  text: string
  options: string[]
  allowOther: boolean
  priority: 'required' | 'optional'
}

/**
 * Classification result from conversational flow
 */
export interface ConversationalResult {
  hsCode: string
  description: string
  confidence: number
  reasoning: string
  alternatives: AlternativeCode[]
  clarificationImpact?: string
}

/**
 * Alternative HS code suggestion
 */
export interface AlternativeCode {
  code: string
  description: string
  confidence?: number
  reason?: string
}

/**
 * Summary of the conversation
 */
export interface ConversationSummary {
  totalRounds: number
  questionsAsked: number
  answersProvided: number
  durationMs: number
  history: ConversationHistoryItem[]
}

/**
 * Single item in conversation history
 */
export interface ConversationHistoryItem {
  turn: number
  type: 'question' | 'answer' | 'classification'
  content: string
  selectedOption?: string
  timestamp: string
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
 * Fetch with timeout using AbortController
 * @param url - Request URL
 * @param options - Fetch options
 * @param timeout - Timeout in milliseconds (default: 90000ms = 90s for LLM calls)
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 90000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)

    // Check if request was aborted (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout - server took too long to respond', 408)
    }

    throw error
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
    const response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    // Try to parse JSON response
    let data: any
    try {
      data = await response.json()
    } catch (jsonError) {
      // JSON parse error - server returned non-JSON response
      throw new ApiError(
        'Invalid server response - expected JSON',
        response.status
      )
    }

    if (!response.ok) {
      throw new ApiError(
        data.message || data.error || 'API request failed',
        response.status,
        data
      )
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    // Network error (offline, CORS, etc.)
    if (error instanceof TypeError) {
      throw new ApiError(
        'Network error - please check your internet connection',
        0
      )
    }

    // Unknown error
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      0
    )
  }
}

/**
 * Classify a product using the unified classification endpoint
 *
 * @param request - Classification request data
 * @returns Classification results
 */
export async function classifyProduct(
  request: ClassifyRequest
): Promise<ClassifyResponse> {
  // Use the unified /api/classify endpoint
  const response = await fetchAPI<any>('/api/classify', {
    method: 'POST',
    body: JSON.stringify({
      query: request.productDescription
    }),
  })

  // Handle classification response
  if (response.responseType === 'classification' && response.hsCode) {
    return {
      success: true,
      results: [{
        hsCode: response.hsCode,
        description: response.description || '',
        confidence: response.confidence || 0,
        reasoning: response.reasoning || ''
      }],
      classificationId: `cls_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString()
    }
  }

  // Handle question response - return empty results, caller should use classifyConversational
  if (response.responseType === 'question') {
    return {
      success: true,
      results: [],
      classificationId: `cls_question_${Date.now()}`,
      timestamp: new Date().toISOString()
    }
  }

  // Fallback if response format is unexpected
  return {
    success: false,
    results: [],
    classificationId: `cls_error_${Date.now()}`,
    timestamp: new Date().toISOString()
  }
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
 * Semantic search for HS codes
 *
 * @param query - Natural language search query
 * @param limit - Number of results to return (default: 10)
 * @returns Array of matching HS codes with similarity scores
 */
export async function searchCodes(
  query: string,
  limit: number = 10
): Promise<{ results: any[]; total: number }> {
  return fetchAPI('/api/vector-search/search', {
    method: 'POST',
    body: JSON.stringify({ query, limit }),
  })
}

/**
 * Hybrid search combining keyword and semantic search
 *
 * @param query - Search query
 * @param limit - Number of results to return (default: 10)
 * @returns Array of matching HS codes ranked by relevance
 */
export async function hybridSearch(
  query: string,
  limit: number = 10
): Promise<{ results: any[]; total: number }> {
  return fetchAPI('/api/vector-search/hybrid-search', {
    method: 'POST',
    body: JSON.stringify({ query, limit }),
  })
}

/**
 * Find similar HS codes to a given code
 *
 * @param hsCode - HS code to find similar codes for
 * @param limit - Number of results to return (default: 10)
 * @returns Array of similar HS codes
 */
export async function findSimilarCodes(
  hsCode: string,
  limit: number = 10
): Promise<{ results: any[]; total: number }> {
  return fetchAPI(`/api/vector-search/similar/${hsCode}?limit=${limit}`)
}

/**
 * Get system statistics
 *
 * @returns Database and system statistics
 */
export async function getSystemStats(): Promise<{
  totalCodes: number
  codesWithEmbeddings: number
  embeddingDimension: number
  lastUpdated: string
}> {
  return fetchAPI('/api/vector-search/stats')
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

// ========================================
// Conversational Classification API
// ========================================

/**
 * Start or continue a conversational classification
 *
 * @param request - Conversational classification request
 * @returns Either questions to answer or final classification
 */
export async function classifyConversational(
  request: ConversationalClassifyRequest
): Promise<ConversationalClassifyResponse> {
  // Use the unified /api/classify endpoint with answer continuation support
  const response = await fetchAPI<any>('/api/classify', {
    method: 'POST',
    body: JSON.stringify({
      query: request.productDescription,
      previousAnswers: request.answers
    }),
  })

  // Transform response to ConversationalClassifyResponse format
  if (response.responseType === 'question') {
    return {
      success: true,
      conversationId: request.conversationId || `conv_${Date.now()}`,
      responseType: 'questions',
      questions: response.options ? [{
        id: 'q1',
        text: response.question || '',
        options: response.options.map((opt: any) => opt.label || opt),
        allowOther: true,
        priority: 'required' as const
      }] : [],
      questionContext: response.context,
      timestamp: new Date().toISOString()
    }
  }

  // Handle classification response
  return {
    success: true,
    conversationId: request.conversationId || `conv_${Date.now()}`,
    responseType: 'classification',
    result: {
      hsCode: response.hsCode || '',
      description: response.description || '',
      confidence: response.confidence || 0,
      reasoning: response.reasoning || '',
      alternatives: []
    },
    timestamp: new Date().toISOString()
  }
}

// NOTE: The following functions are stubs as the original endpoints were removed.
// The unified /api/classify endpoint now handles all classification flows.

/**
 * Get details of a conversation (for debugging/audit)
 * @deprecated Endpoint removed - returns stub response
 */
export async function getConversation(
  _conversationId: string
): Promise<{ success: boolean; conversation: any }> {
  // Stub: endpoint no longer exists
  return { success: false, conversation: null }
}

/**
 * Abandon a conversation and start fresh
 * @deprecated Endpoint removed - returns success (no-op)
 */
export async function abandonConversation(
  _conversationId: string
): Promise<{ success: boolean; message: string }> {
  // Stub: no-op since conversations are now stateless
  return { success: true, message: 'Conversation reset (no-op - stateless)' }
}

/**
 * Skip remaining questions and get best guess classification
 * @deprecated Use classifyConversational with current answers instead
 */
export async function skipToClassification(
  _conversationId: string,
  _sessionId: string
): Promise<ConversationalClassifyResponse> {
  // Stub: returns a prompt to use regular classification
  return {
    success: false,
    conversationId: _conversationId,
    responseType: 'classification',
    error: 'Skip not supported - please submit current answers to continue',
    timestamp: new Date().toISOString()
  }
}

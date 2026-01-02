// ============================================================================
// Error Type Definitions for Classification System
// ============================================================================

export type ErrorType =
  | 'network'           // Connection failed
  | 'timeout'           // Request timed out
  | 'server'            // 500 errors
  | 'rate_limit'        // Too many requests
  | 'classification'    // Couldn't find matching code
  | 'validation'        // Invalid input
  | 'unknown';          // Fallback

export interface ClassificationError {
  type: ErrorType;
  message: string;
  details?: string;
  retryable: boolean;
  retryAfter?: number;  // seconds until retry allowed (for rate limit)
  suggestions?: string[];
  originalInput?: string;
}

// ============================================================================
// Error Parser - Converts various error formats to ClassificationError
// ============================================================================

export function parseError(error: unknown, originalInput?: string): ClassificationError {
  // Handle fetch/network errors
  if (error instanceof TypeError) {
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
      return {
        type: 'network',
        message: 'Connection problem',
        details: "We couldn't reach our servers. This is usually temporary.",
        retryable: true,
        suggestions: [
          'Check your internet connection',
          'Wait a few seconds and retry',
          'Try refreshing the page'
        ]
      };
    }
  }

  // Handle timeout errors
  if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
    return {
      type: 'timeout',
      message: 'Request timed out',
      details: 'The server took too long to respond. Please try again.',
      retryable: true,
      suggestions: [
        'Try with a shorter product description',
        'Wait a moment and retry',
        'Check your internet connection'
      ]
    };
  }

  // Handle response errors with status codes
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;

    if (status === 429) {
      const retryAfter = (error as { retryAfter?: number }).retryAfter;
      return {
        type: 'rate_limit',
        message: 'Too many requests',
        details: "You've made several requests. Please wait a moment.",
        retryable: true,
        retryAfter: retryAfter || 60
      };
    }

    if (status >= 500) {
      return {
        type: 'server',
        message: 'Server error',
        details: "Our servers are having issues. We're working on it.",
        retryable: true,
        suggestions: [
          'Wait a few seconds and retry',
          'Try again later if the problem persists'
        ]
      };
    }

    if (status === 400 || status === 422) {
      return {
        type: 'validation',
        message: 'Invalid input',
        details: 'Please check your product description and try again.',
        retryable: false,
        suggestions: [
          'Make sure the description is at least 3 characters',
          'Use clear, specific product terms',
          'Avoid special characters or symbols'
        ],
        originalInput
      };
    }
  }

  // Handle classification-specific errors
  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    const code = errorObj.code as string | undefined;
    const message = errorObj.message as string | undefined;

    if (code === 'NO_MATCH' || code === 'CLASSIFICATION_FAILED' ||
        (message && (message.includes('classify') || message.includes('match')))) {
      return {
        type: 'classification',
        message: "Couldn't find a match",
        details: "We couldn't classify this product automatically.",
        retryable: false,
        suggestions: [
          'Use simpler, more common product terms',
          'Add more details (material, purpose, size)',
          'Try a different product description'
        ],
        originalInput
      };
    }
  }

  // Handle generic Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for network-related messages
    if (message.includes('network') || message.includes('connection') || message.includes('offline')) {
      return {
        type: 'network',
        message: 'Connection problem',
        details: "We couldn't reach our servers. This is usually temporary.",
        retryable: true,
        suggestions: [
          'Check your internet connection',
          'Wait a few seconds and retry',
          'Try refreshing the page'
        ]
      };
    }

    // Check for classification-related messages
    if (message.includes('classification') || message.includes('no match') || message.includes('not found')) {
      return {
        type: 'classification',
        message: "Couldn't find a match",
        details: error.message,
        retryable: false,
        suggestions: [
          'Use simpler, more common product terms',
          'Add more details (material, purpose, size)',
          'Try a different product description'
        ],
        originalInput
      };
    }

    // Return unknown error with the actual message
    return {
      type: 'unknown',
      message: 'Something went wrong',
      details: error.message || 'An unexpected error occurred. Please try again.',
      retryable: true
    };
  }

  // Unknown error - fallback
  return {
    type: 'unknown',
    message: 'Something went wrong',
    details: 'An unexpected error occurred. Please try again.',
    retryable: true
  };
}

// ============================================================================
// Error Type Guards
// ============================================================================

export function isNetworkError(error: ClassificationError): boolean {
  return error.type === 'network' || error.type === 'timeout';
}

export function isRetryable(error: ClassificationError): boolean {
  return error.retryable;
}

export function isClassificationError(error: ClassificationError): boolean {
  return error.type === 'classification';
}

export function isRateLimited(error: ClassificationError): boolean {
  return error.type === 'rate_limit';
}

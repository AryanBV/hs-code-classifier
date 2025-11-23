import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/classify
 *
 * Proxy API route to backend classification endpoint
 * This keeps the backend URL hidden from the client
 *
 * TODO: Implement in Phase 2
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // NOTE: This API route is not used in production
    // Frontend uses api-client.ts to call backend directly
    // Keeping this file for potential future proxy needs

    // Placeholder response
    return NextResponse.json({
      success: true,
      message: 'API proxy not implemented - frontend uses direct API calls',
      data: body
    })

  } catch (error) {
    console.error('API proxy error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to classify product',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

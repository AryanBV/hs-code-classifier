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

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

    // TODO: Forward request to backend
    // const response = await fetch(`${backendUrl}/api/classify`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(body),
    // })

    // const data = await response.json()
    // return NextResponse.json(data, { status: response.status })

    // Placeholder response
    return NextResponse.json({
      success: true,
      message: 'API proxy will be implemented in Phase 2',
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

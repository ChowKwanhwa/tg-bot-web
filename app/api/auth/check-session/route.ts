import { NextRequest } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.user) {
      return handleAuthError(auth.error!)
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: auth.user.email,
        session: auth.user.email,
        status: 'valid',
        username: auth.user.email,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Session check error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to check session'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
}

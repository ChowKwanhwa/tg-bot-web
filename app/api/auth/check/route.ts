import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    return NextResponse.json({
      success: true,
      isAuthenticated: auth.success,
      user: auth.success ? auth.user : null
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      isAuthenticated: false,
      error: 'Failed to verify authentication'
    })
  }
}

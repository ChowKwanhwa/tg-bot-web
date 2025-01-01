import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'your-jwt-secret-key'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth-token')

    if (!token) {
      return NextResponse.json(
        { message: '未登录' },
        { status: 401 }
      )
    }

    try {
      jwt.verify(token.value, JWT_SECRET)
      return NextResponse.json({ message: '已登录' })
    } catch (error) {
      return NextResponse.json(
        { message: '登录已过期' },
        { status: 401 }
      )
    }
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json(
      { message: '验证失败' },
      { status: 500 }
    )
  }
}

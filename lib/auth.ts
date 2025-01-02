import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import * as jose from 'jose'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

// 管理员凭据
const ADMIN_USERNAME = 'fchow'

export interface AuthResult {
  success: boolean
  error?: string
  user?: {
    email: string
    isAdmin: boolean
  }
}

export async function verifyAuth(request: NextRequest, requireAdmin = false): Promise<AuthResult> {
  try {
    // 获取 cookie
    const cookieStore = await request.cookies
    const token = cookieStore.get('auth-token')

    if (!token) {
      return {
        success: false,
        error: 'No token found'
      }
    }

    // 验证 token
    const { payload } = await jose.jwtVerify(token.value, JWT_SECRET)
    const email = payload.email as string
    const isAdmin = payload.isAdmin as boolean

    if (!email) {
      return {
        success: false,
        error: 'Invalid token'
      }
    }

    // 管理员用户特殊处理
    if (email === ADMIN_USERNAME && isAdmin) {
      return {
        success: true,
        user: {
          email: ADMIN_USERNAME,
          isAdmin: true
        }
      }
    }

    // 普通用户处理
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return {
        success: false,
        error: 'User not found'
      }
    }

    // 检查用户是否过期
    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      // 删除过期用户
      await prisma.user.delete({
        where: { email }
      })
      return {
        success: false,
        error: 'User expired'
      }
    }

    // 如果需要管理员权限，检查用户是否是管理员
    if (requireAdmin && !user.isAdmin) {
      return {
        success: false,
        error: 'Admin privileges required'
      }
    }

    return {
      success: true,
      user: {
        email: user.email,
        isAdmin: user.isAdmin
      }
    }

  } catch (error) {
    console.error('Auth error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed'
    }
  }
}

export function handleAuthError(error: string): NextResponse {
  return NextResponse.json(
    { success: false, message: error },
    { status: 401 }
  )
}

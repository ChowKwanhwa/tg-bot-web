import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as jose from 'jose'

const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

// 不需要验证的路由
const publicPaths = [
  '/login',
  '/api/auth/login',
  '/_next',
  '/favicon.ico'
]

// 需要管理员权限的路由
const adminPaths = [
  '/api/admin',
  '/admin'
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // 检查是否是公开路由
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  console.log('Middleware: Checking path:', pathname)

  // 获取认证 token
  const token = request.cookies.get('auth-token')
  console.log('Middleware: Auth token present:', !!token)

  // 如果没有 token，重定向到登录页面
  if (!token) {
    console.log('Middleware: No token, redirecting to login')
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    // 验证 token
    const { payload } = await jose.jwtVerify(token.value, JWT_SECRET)
    console.log('Middleware: Token payload:', payload)

    // 检查是否需要管理员权限
    const needsAdmin = adminPaths.some(path => pathname.startsWith(path))
    if (needsAdmin && !payload.isAdmin) {
      console.log('Middleware: Admin access required but user is not admin')
      return NextResponse.redirect(new URL('/', request.url))
    }

    // 检查是否过期
    const expiresAt = payload.expiresAt as string | undefined
    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.log('Middleware: Token expired')
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('auth-token')
      return response
    }

    console.log('Middleware: Auth check passed')
    return NextResponse.next()

  } catch (error) {
    console.error('Middleware: Auth error:', error)
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('auth-token')
    return response
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

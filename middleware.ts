import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as jose from 'jose'

const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

// 不需要验证的路径
const publicPaths = ['/login', '/api/auth/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  console.log('Middleware processing path:', pathname)

  // 如果是公开路径，直接放行
  if (publicPaths.some(path => pathname.startsWith(path))) {
    console.log('Public path, allowing access:', pathname)
    return NextResponse.next()
  }

  // 检查是否是 API 路由的预检请求
  if (request.method === 'OPTIONS') {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth-token')?.value
  console.log('Auth token found:', !!token)

  if (!token) {
    console.log('No token found, redirecting to login')
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  try {
    // 验证 token
    const { payload } = await jose.jwtVerify(token, JWT_SECRET)
    console.log('Token verified successfully:', payload)

    // 检查管理员权限
    if (pathname.startsWith('/admin') && !payload.isAdmin) {
      console.log('Unauthorized access to admin page')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    return NextResponse.next()
  } catch (error) {
    console.error('Token verification failed:', error)
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }
}

// 配置需要进行中间件处理的路径
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}

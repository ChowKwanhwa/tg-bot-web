import { NextResponse } from 'next/server'
import * as jose from 'jose'
import { cookies } from 'next/headers'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Initialize Prisma Client
const prisma = new PrismaClient()

const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')
const ADMIN_USERNAME = 'fchow'
const ADMIN_PASSWORD = 'Tgbotweb.!2022'

// Initialize local cache
declare global {
  var _localUserCache: Map<string, { email: string; password: string }> | undefined
}

if (!global._localUserCache) {
  global._localUserCache = new Map()
}

// Add test user to local cache
async function addTestUser() {
  const testEmail = 'test@example.com'
  const testPassword = 'password123'
  const hashedPassword = await bcrypt.hash(testPassword, 10)
  global._localUserCache?.set(testEmail, {
    email: testEmail,
    password: hashedPassword
  })
  console.log('Added test user to local cache')
}

// Add test user
addTestUser()

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password, email } = body

    // Admin login
    if (username) {
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return NextResponse.json(
          { message: '用户名或密码错误' },
          { status: 401 }
        )
      }
    }
    // Regular user login
    else if (email) {
      try {
        // First check local cache
        const cachedUser = global._localUserCache?.get(email)
        
        if (cachedUser) {
          console.log('User found in local cache')
          const isValidPassword = await bcrypt.compare(password, cachedUser.password)
          if (!isValidPassword) {
            return NextResponse.json(
              { message: '邮箱或密码错误' },
              { status: 401 }
            )
          }
        } else {
          // If not in cache, try to get from database
          try {
            console.log('Querying database for user...')
            const user = await prisma.user.findUnique({
              where: { email }
            })
            
            if (!user) {
              return NextResponse.json(
                { message: '邮箱或密码错误' },
                { status: 401 }
              )
            }

            const isValidPassword = await bcrypt.compare(password, user.password)
            if (!isValidPassword) {
              return NextResponse.json(
                { message: '邮箱或密码错误' },
                { status: 401 }
              )
            }

            // Add to local cache
            global._localUserCache?.set(email, {
              email: user.email,
              password: user.password
            })
          } catch (dbError) {
            console.error('Database error:', dbError)
            return NextResponse.json(
              { message: '服务器错误，请稍后重试' },
              { status: 500 }
            )
          }
        }
      } catch (error) {
        console.error('Login verification error:', error)
        return NextResponse.json(
          { message: '验证失败，请重试' },
          { status: 500 }
        )
      }
    }
    else {
      return NextResponse.json(
        { message: '无效的登录请求' },
        { status: 400 }
      )
    }

    // Create JWT token
    const token = await new jose.SignJWT({ 
      username: username || email,
      isAdmin: !!username
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET)

    // Create response
    const response = NextResponse.json(
      { 
        success: true, 
        redirectTo: username ? '/admin' : '/auto-chat' 
      },
      { status: 200 }
    )

    // Set cookie
    response.cookies.set({
      name: 'auth-token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
    })

    return response

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { message: '登录失败，请重试' },
      { status: 500 }
    )
  }
}

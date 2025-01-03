import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import * as jose from 'jose'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

// 管理员凭据
const ADMIN_USERNAME = 'fchow'
const ADMIN_PASSWORD = 'Tgbotweb.!2022'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // 管理员登录
    if (email === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = await new jose.SignJWT({
        email: ADMIN_USERNAME,
        isAdmin: true,
        expiresAt: null
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('365d')
        .sign(JWT_SECRET)

      const response = NextResponse.json({ 
        success: true,
        user: {
          email: ADMIN_USERNAME,
          isAdmin: true,
          expiresAt: null
        }
      })

      response.cookies.set({
        name: 'auth-token',
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      })

      return response
    }

    // 普通用户登录
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, message: '没有此用户，请联系https://t.me/kowliep购买' },
        { status: 401 }
      )
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return NextResponse.json(
        { success: false, message: '密码错误' },
        { status: 401 }
      )
    }

    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      await prisma.user.delete({
        where: { email }
      })
      return NextResponse.json(
        { success: false, message: '账户超过有效期，请重新购买' },
        { status: 401 }
      )
    }

    const token = await new jose.SignJWT({
      email: user.email,
      isAdmin: user.isAdmin,
      expiresAt: user.expiresAt?.toISOString()
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5d')
      .sign(JWT_SECRET)

    const response = NextResponse.json({ 
      success: true,
      user: {
        email: user.email,
        isAdmin: user.isAdmin,
        expiresAt: user.expiresAt
      }
    })

    response.cookies.set({
      name: 'auth-token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, message: 'Login failed' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

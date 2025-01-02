'use server'

import { cookies } from 'next/headers'
import { PrismaClient } from '@prisma/client'
import * as jose from 'jose'
import * as bcrypt from 'bcryptjs'
import { headers } from 'next/headers'

const prisma = new PrismaClient()
const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

// 管理员凭据
const ADMIN_USERNAME = 'fchow'
const ADMIN_PASSWORD = 'Tgbotweb.!2022'

function createCookieHeader(token: string) {
  const cookieValue = `auth-token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24}`
  if (process.env.NODE_ENV === 'production') {
    return `${cookieValue}; Secure`
  }
  return cookieValue
}

export async function login(formData: FormData) {
  const username = formData.get('username') as string
  const password = formData.get('password') as string
  const email = formData.get('email') as string
  const isAdmin = formData.get('isAdmin') === 'true'

  console.log('Server Action: Processing login request')

  try {
    // 管理员登录
    if (isAdmin) {
      console.log('Server Action: Processing admin login')
      if (!username || !password) {
        return { error: '请输入用户名和密码' }
      }

      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return { error: '用户名或密码错误' }
      }

      console.log('Server Action: Admin login successful')
      // 创建管理员 JWT token
      const token = await new jose.SignJWT({
        username: username,
        isAdmin: true
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('24h')
        .sign(JWT_SECRET)

      // 创建响应
      const response = new Response(null, {
        status: 200,
        headers: {
          'Set-Cookie': createCookieHeader(token)
        }
      })

      return { success: true, redirectTo: '/admin', response }
    }

    // 普通用户登录
    console.log('Server Action: Processing user login')
    if (!email || !password) {
      return { error: '请输入邮箱和密码' }
    }

    // 查找用户
    console.log('Server Action: Looking up user in database')
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return { error: '邮箱或密码错误' }
    }

    // 检查用户是否过期
    if (user.expiresAt && new Date() > user.expiresAt) {
      console.log('Server Action: User account expired')
      await prisma.user.delete({
        where: { email }
      })
      return { error: '账号已过期' }
    }

    // 验证密码
    console.log('Server Action: Verifying password')
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return { error: '邮箱或密码错误' }
    }

    console.log('Server Action: User login successful')
    // 创建用户 JWT token
    const token = await new jose.SignJWT({
      username: user.email,
      isAdmin: false
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET)

    // 创建响应
    const response = new Response(null, {
      status: 200,
      headers: {
        'Set-Cookie': createCookieHeader(token)
      }
    })

    return { success: true, redirectTo: '/auto-chat', response }
  } catch (error) {
    console.error('Server Action: Error:', error)
    return { error: '登录失败，请重试' }
  } finally {
    await prisma.$disconnect()
  }
}

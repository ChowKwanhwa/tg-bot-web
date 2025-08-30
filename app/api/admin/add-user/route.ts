import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { PrismaClient, Prisma } from '@prisma/client'
import { verifyAuth, handleAuthError } from '@/lib/auth'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // 验证管理员身份
    const auth = await verifyAuth(request, true)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    // 解析请求数据
    const { email, password, expiresAt } = await request.json()
    console.log('1. Received request:', {
      email,
      expiresAt,
      currentTime: new Date().toISOString()
    })

    // 验证必需字段
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: '邮箱和密码都是必需的' },
        { status: 400 }
      )
    }

    // 哈希密码
    const hashedPassword = await bcrypt.hash(password, 10)

    // 计算过期时间
    let expiresAtDate: Date | null = null
    if (expiresAt) {
      console.log('2. Processing expiration:', {
        receivedExpiresAt: expiresAt,
        currentTime: new Date().toISOString()
      })

      const date = new Date(expiresAt)
      // 如果年份是9999，则表示永不过期
      if (date.getFullYear() === 9999) {
        expiresAtDate = null
        console.log('3. Set to never expire')
      } else {
        // 验证日期是否有效
        if (isNaN(date.getTime())) {
          console.log('3. Invalid date')
          return NextResponse.json(
            { success: false, message: '无效的过期时间' },
            { status: 400 }
          )
        }
        
        // 确保过期时间在当前时间之后
        const now = new Date()
        console.log('3. Time comparison:', {
          expiresAt: date.toISOString(),
          now: now.toISOString(),
          diffHours: (date.getTime() - now.getTime()) / (1000 * 60 * 60)
        })

        // 创建用户
        expiresAtDate = date
      }
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        isAdmin: false,
        expiresAt: expiresAtDate
      }
    })

    console.log('4. User created:', {
      email: user.email,
      expiresAt: user.expiresAt,
      currentTime: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      data: {
        email: user.email,
        expiresAt: user.expiresAt
      }
    }, { status: 201 })

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('Error adding user:', errorMessage)
    // 处理唯一约束冲突
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, message: '该邮箱已被使用' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

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
      expiresAtDate = new Date(expiresAt)
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

    return NextResponse.json({
      success: true,
      data: {
        email: user.email,
        expiresAt: user.expiresAt
      }
    }, { status: 201 })

  } catch (error: any) {
    console.error('Error adding user:', error)
    // 处理唯一约束冲突
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, message: '该邮箱已被使用' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, message: error.message || '添加用户失败' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

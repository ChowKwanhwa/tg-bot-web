import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { message: '该邮箱已被注册' },
        { status: 400 }
      )
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10)

    // 保存用户
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword
      }
    })

    return NextResponse.json(
      { message: '用户添加成功', user: { email: user.email } },
      { status: 200 }
    )

  } catch (error) {
    console.error('Add user error:', error)
    return NextResponse.json(
      { message: '添加用户失败' },
      { status: 500 }
    )
  }
}

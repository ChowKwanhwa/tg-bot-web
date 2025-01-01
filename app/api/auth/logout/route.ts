import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    // 删除认证 cookie
    const cookieStore = await cookies()
    await cookieStore.set({
      name: 'auth-token',
      value: '',
      expires: new Date(0),
    })
    
    return NextResponse.json({ message: '登出成功' })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { message: '登出失败，请重试' },
      { status: 500 }
    )
  }
}

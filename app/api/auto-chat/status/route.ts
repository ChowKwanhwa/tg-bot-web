import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    const { processId } = await request.json()

    if (!processId) {
      return NextResponse.json({
        success: false,
        message: 'Process ID is required'
      }, { status: 400 })
    }

    // 这里可以添加进程状态检查的逻辑
    // 例如检查进程是否仍在运行，获取输出等
    
    return NextResponse.json({
      success: true,
      running: true, // 根据实际情况返回
      output: `Process ${processId} is running...`,
      error: null
    })

  } catch (error) {
    console.error('Error checking process status:', error)
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to check process status'
    }, { status: 500 })
  }
}

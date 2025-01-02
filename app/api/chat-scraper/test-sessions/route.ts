import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, message: auth.error || 'Unauthorized' },
        { status: 401 }
      )
    }

    // 获取用户的 sessions 目录
    const userSessionsDir = path.join('D:', 'tg-bot-web', 'sessions', auth.user.email)

    // 验证目录是否存在且在允许的范围内
    if (!fs.existsSync(userSessionsDir)) {
      return NextResponse.json({
        success: false,
        message: '没有找到会话文件',
        details: {
          path: userSessionsDir,
          suggestion: '请先上传会话文件再进行测试'
        }
      }, { 
        status: 200  
      })
    }

    // 验证目录是否在允许的范围内
    const normalizedSessionsDir = path.normalize(userSessionsDir)
    const normalizedBasePath = path.normalize(path.join('D:', 'tg-bot-web', 'sessions'))
    if (!normalizedSessionsDir.startsWith(normalizedBasePath)) {
      return NextResponse.json({
        success: false,
        message: '无权访问此目录',
        details: {
          error: 'UNAUTHORIZED_ACCESS',
          path: userSessionsDir
        }
      }, { 
        status: 403 
      })
    }

    const scriptPath = path.join('D:', 'tg-bot-web', 'scripts', 'test_sessions.py')

    return new Promise((resolve) => {
      const pythonProcess = spawn('python', [
        scriptPath,
        '--sessions-dir', userSessionsDir
      ])

      let output = ''
      let error = ''

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString()
      })

      pythonProcess.stderr.on('data', (data) => {
        error += data.toString()
        console.error('Python script error:', data.toString())
      })

      pythonProcess.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const results = JSON.parse(output)
            resolve(NextResponse.json({
              success: true,
              results
            }))
          } catch (e) {
            console.error('Failed to parse Python script output:', e)
            resolve(NextResponse.json(
              { success: false, message: 'Failed to parse test results' },
              { status: 500 }
            ))
          }
        } else {
          resolve(NextResponse.json(
            { success: false, message: error || 'Failed to test sessions' },
            { status: 500 }
          ))
        }
      })
    })

  } catch (error: any) {
    console.error('Error testing sessions:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to test sessions' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    const { email } = auth.user!

    // 获取用户的测试会话目录
    const userSessionDir = path.join(process.cwd(), 'scraped_data', email)
    
    // 如果目录不存在，返回空数组
    if (!fs.existsSync(userSessionDir)) {
      return NextResponse.json({ 
        success: true, 
        data: [] 
      })
    }

    // 读取所有会话文件
    const files = fs.readdirSync(userSessionDir)
    const sessions = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(userSessionDir, file)
        const stats = fs.statSync(filePath)
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        return {
          id: path.basename(file, '.json'),
          createdAt: stats.birthtime,
          ...content
        }
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return NextResponse.json({ 
      success: true, 
      data: sessions 
    })

  } catch (error: any) {
    console.error('Error fetching test sessions:', error)
    const errorMessage = error instanceof Error ? error.message : '获取会话失败'
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    )
  }
}

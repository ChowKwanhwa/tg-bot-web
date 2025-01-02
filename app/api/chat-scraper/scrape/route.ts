import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    const { email } = auth.user!
    const { sessionFile, groupUsername, messageLimit } = await request.json()

    if (!sessionFile || !groupUsername) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // 构建Python脚本路径
    const scriptPath = path.join(process.cwd(), 'scripts', 'scrape_messages.py')

    return new Promise((resolve) => {
      const process = spawn('python', [
        scriptPath,
        '--session', sessionFile,
        '--group', groupUsername,
        '--limit', messageLimit?.toString() || '1000',
        '--user-email', email
      ])

      let output = ''
      let error = ''

      process.stdout.on('data', (data) => {
        output += data.toString()
      })

      process.stderr.on('data', (data) => {
        error += data.toString()
      })

      process.on('close', (code) => {
        if (code === 0) {
          resolve(NextResponse.json({
            success: true,
            message: 'Messages scraped successfully',
            output
          }))
        } else {
          resolve(NextResponse.json({
            success: false,
            message: 'Failed to scrape messages',
            error
          }, { status: 500 }))
        }
      })
    })
  } catch (error) {
    console.error('Error in chat scraper:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

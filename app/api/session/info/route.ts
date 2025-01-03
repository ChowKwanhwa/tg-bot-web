import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { getJwtPayload } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // 验证 JWT token
    const payload = await getJwtPayload(req)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userEmail = payload.email
    
    // 运行 Python 脚本
    const scriptPath = path.join(process.cwd(), 'scripts', 'get_session_info.py')
    
    return new Promise((resolve) => {
      const pythonProcess = spawn('python', [
        scriptPath,
        '--user-email',
        userEmail
      ])

      let output = ''
      let errorOutput = ''

      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString()
        console.log('Python stdout:', text)
        output += text
      })

      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString()
        console.error('Python stderr:', text)
        errorOutput += text
      })

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`)
          resolve(NextResponse.json({ 
            success: false,
            error: errorOutput || 'Failed to get session information'
          }))
          return
        }

        try {
          // 解析所有 JSON 输出
          const results = output
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line))
            .filter(result => result.type === 'success')

          resolve(NextResponse.json({
            success: true,
            sessions: results
          }))
        } catch (e) {
          resolve(NextResponse.json({ 
            success: false,
            error: 'Failed to parse session information'
          }))
        }
      })
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Internal server error'
    }, { 
      status: 500 
    })
  }
}

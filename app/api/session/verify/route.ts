import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { pendingSessions } from '../store'
import { cookies } from 'next/headers'
import * as jose from 'jose'

const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

export async function POST(req: Request): Promise<Response> {
  try {
    // 验证用户身份
    const cookieStore = await cookies()
    const token = await cookieStore.get('auth-token')
    
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 解析JWT获取用户邮箱
    const { payload } = await jose.jwtVerify(token.value, JWT_SECRET)
    const userEmail = payload.email as string

    if (!userEmail) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 401 }
      )
    }

    const { phoneNumber, verificationCode, password2FA } = await req.json()
    console.log('Verify request:', { phoneNumber, hasCode: !!verificationCode, has2FA: !!password2FA })
    console.log('Pending sessions:', Object.keys(pendingSessions))

    if (!phoneNumber || !verificationCode) {
      return NextResponse.json(
        { success: false, message: 'Phone number and verification code are required' },
        { status: 400 }
      )
    }

    const session = pendingSessions[phoneNumber]
    if (!session) {
      console.log('Session not found for phone number:', phoneNumber)
      return NextResponse.json(
        { success: false, message: 'Session not found' },
        { status: 404 }
      )
    }

    console.log('Session user email:', session.userEmail)
    console.log('Current user email:', userEmail)
    // 验证用户身份匹配
    if (session.userEmail !== userEmail) {
      return NextResponse.json(
        { success: false, message: 'Session ownership mismatch' },
        { status: 403 }
      )
    }

    console.log('Writing verification code to Python process...')
    session.process.stdin.write(verificationCode + '\n')

    return new Promise<Response>((resolve) => {
      let output = session.output || ''
      let errorOutput = session.errorOutput || ''
      let sessionCreated = false
      let needs2FA = false
      
      session.process.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        console.log('Python stdout:', text)
        output += text

        if (text.includes('[SUCCESS] Session file created')) {
          sessionCreated = true
        }
        
        // Check for 2FA prompt in both English and Chinese
        if (text.includes('Two-factor authentication') || 
            text.includes('检测到两步验证')) {
          needs2FA = true
          if (password2FA) {
            console.log('Writing 2FA password to Python process...')
            session.process.stdin.write(password2FA + '\n')
          } else {
            resolve(NextResponse.json({ 
              success: false, 
              needs2FA: true,
              message: '需要两步验证密码'
            }))
            return
          }
        }
      })

      session.process.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        console.log('Python stderr:', text)
        errorOutput += text
      })

      session.process.on('close', (code: number | null) => {
        // Clean up session
        delete pendingSessions[phoneNumber]

        if (code === 0 && sessionCreated) {
          // Get session file path
          const sessionDir = path.join(process.cwd(), 'sessions', userEmail)
          const sessionFile = path.join(sessionDir, `${phoneNumber}.session`)

          if (fs.existsSync(sessionFile)) {
            resolve(NextResponse.json({
              success: true,
              message: 'Session created successfully'
            }))
          } else {
            resolve(NextResponse.json(
              { 
                success: false, 
                message: 'Session file not found after creation',
                error: errorOutput
              },
              { status: 500 }
            ))
          }
        } else {
          resolve(NextResponse.json(
            { 
              success: false, 
              message: 'Failed to create session',
              error: errorOutput
            },
            { status: 500 }
          ))
        }
      })

      session.process.on('error', (error: Error) => {
        // Clean up session
        delete pendingSessions[phoneNumber]

        console.error('Process error:', error)
        resolve(NextResponse.json(
          { 
            success: false, 
            message: 'Session verification process failed',
            error: error.message
          },
          { status: 500 }
        ))
      })
    })

  } catch (error) {
    console.error('Verification error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to process verification',
        error: errorMessage
      },
      { status: 500 }
    )
  }
}

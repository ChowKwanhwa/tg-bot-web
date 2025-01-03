import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { pendingSessions } from '../store'
import { cookies } from 'next/headers'
import * as jose from 'jose'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'

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

    const { phoneNumber } = await req.json()

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Create user's sessions directory
    const rootDir = process.cwd()
    const userSessionsDir = path.join(rootDir, 'sessions', userEmail)
    if (!existsSync(userSessionsDir)) {
      await mkdir(userSessionsDir, { recursive: true })
    }

    // Get Python script path
    const scriptPath = path.join(process.cwd(), 'scripts', 'session_gen.py')
    console.log('Python script path:', scriptPath)

    // Run Python script with user's session directory
    const pythonProcess = spawn('python', [
      scriptPath,
      phoneNumber,
      '--output-dir', userSessionsDir,
      '--user-email', userEmail
    ])

    return new Promise<Response>((resolve) => {
      let output = ''
      let errorOutput = ''
      let codeRequestSent = false
      let timeout: NodeJS.Timeout

      // Set a timeout of 60 seconds
      timeout = setTimeout(() => {
        console.log('Request timed out')
        pythonProcess.kill()
        resolve(NextResponse.json(
          { success: false, message: 'Request timed out' },
          { status: 504 }
        ))
      }, 60000)

      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString()
        console.log('Python stdout:', text)
        output += text
        
        // Check if verification code is requested (both English and Chinese)
        if ((text.includes('Enter the verification code') || 
             text.includes('请输入收到的验证码')) && 
            !codeRequestSent) {
          codeRequestSent = true
          clearTimeout(timeout)
          
          // Store session info with user email
          console.log('Storing session for phone:', phoneNumber)
          pendingSessions[phoneNumber] = {
            process: pythonProcess,
            userEmail: userEmail,
            outputDir: userSessionsDir
          }
          console.log('Current pending sessions:', Object.keys(pendingSessions))
          
          resolve(NextResponse.json({
            success: true,
            waitingForCode: true,
            message: '验证码已发送到您的 Telegram 账号'
          }))
        }
      })

      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString()
        console.error('Python stderr:', text)
        errorOutput += text
      })

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout)
        console.log(`Python process exited with code ${code}`)
        
        if (!codeRequestSent) {
          if (code === 0) {
            resolve(NextResponse.json({
              success: true,
              message: 'Session generated successfully'
            }))
          } else {
            resolve(NextResponse.json({
              success: false,
              message: errorOutput || 'Failed to generate session'
            }, { status: 500 }))
          }
        }
      })
    })
  } catch (error) {
    console.error('Error in session generation:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

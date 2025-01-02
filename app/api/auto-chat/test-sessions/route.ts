import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

const prisma = new PrismaClient()

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    const { email } = auth.user!

    // Get root directory and sessions directory
    const rootDir = path.resolve(process.cwd())
    const sessionsDir = path.join(rootDir, 'sessions')
    const scriptPath = path.join(rootDir, 'scripts', 'test_sessions.py')

    // Verify sessions directory exists
    if (!fs.existsSync(sessionsDir)) {
      return NextResponse.json(
        { success: false, message: 'Sessions directory not found' },
        { status: 404 }
      )
    }

    // Get all session files
    const sessionFiles = fs.readdirSync(sessionsDir)
      .filter(file => file.endsWith('.session'))

    if (sessionFiles.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No session files found' },
        { status: 404 }
      )
    }

    return new Promise<Response>((resolve) => {
      const pythonProcess = spawn('python', [scriptPath, email], {
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        }
      })

      let jsonOutput = ''

      pythonProcess.stdout.on('data', (data) => {
        jsonOutput += data.toString()
      })

      pythonProcess.stderr.on('data', (data) => {
        console.error('Python error:', data.toString())
      })

      pythonProcess.on('close', async (code) => {
        if (code === 0 && jsonOutput) {
          try {
            const results = JSON.parse(jsonOutput.trim())
            resolve(NextResponse.json(results))
          } catch (error: any) {
            console.error('Failed to parse JSON:', error)
            console.error('Raw output:', jsonOutput)
            resolve(NextResponse.json(
              { 
                success: false, 
                message: 'Failed to parse test results',
                error: error.message
              },
              { status: 500 }
            ))
          }
        } else {
          resolve(NextResponse.json(
            { 
              success: false, 
              message: 'Test script failed or produced no output',
              code,
              output: jsonOutput
            },
            { status: 500 }
          ))
        }
      })
    })
  } catch (error) {
    console.error('Error testing sessions:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

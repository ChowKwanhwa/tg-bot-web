import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export async function GET(): Promise<Response> {
  try {
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

    // Test sessions using Python script
    return new Promise<Response>((resolve) => {
      const process = spawn('python', [scriptPath])
      let output = ''
      let error = ''

      process.stdout.on('data', (data) => {
        output += data.toString()
      })

      process.stderr.on('data', (data) => {
        error += data.toString()
      })

      process.on('close', (code) => {
        if (code !== 0) {
          resolve(
            NextResponse.json(
              { success: false, message: error || 'Test failed' },
              { status: 500 }
            )
          )
          return
        }

        try {
          const results = JSON.parse(output)
          resolve(NextResponse.json(results))
        } catch (e) {
          resolve(
            NextResponse.json(
              { success: false, message: 'Failed to parse test results' },
              { status: 500 }
            )
          )
        }
      })
    })

  } catch (error: any) {
    console.error('Test error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

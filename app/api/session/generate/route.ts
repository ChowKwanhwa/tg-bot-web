import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { pendingSessions } from '../store'

export async function POST(req: Request) {
  try {
    const { phoneNumber } = await req.json()

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Get Python script path
    const scriptPath = path.join(process.cwd(), 'scripts', 'session_gen.py')
    console.log('Python script path:', scriptPath)

    // Run Python script
    const pythonProcess = spawn('python', [scriptPath, phoneNumber])

    return new Promise((resolve) => {
      let output = ''
      let errorOutput = ''
      let codeRequestSent = false
      let timeout: NodeJS.Timeout

      // Set a timeout of 30 seconds
      timeout = setTimeout(() => {
        console.log('Request timed out')
        pythonProcess.kill()
        resolve(NextResponse.json(
          { success: false, message: 'Request timed out' },
          { status: 504 }
        ))
      }, 30000)

      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString()
        console.log('Python stdout:', text)
        output += text
        
        // Check if verification code is requested
        if (text.includes('Enter the verification code') && !codeRequestSent) {
          codeRequestSent = true
          clearTimeout(timeout)
          
          // Store session info
          pendingSessions[phoneNumber] = {
            scriptProcess: pythonProcess
          }
          
          resolve(NextResponse.json({ 
            success: true, 
            waitingForCode: true,
            message: 'Verification code has been sent to your Telegram account'
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
        console.log('Python process exited with code:', code)
        console.log('Final output:', output)
        console.log('Error output:', errorOutput)

        if (!codeRequestSent) {
          if (code === 0) {
            resolve(NextResponse.json({ success: true }))
          } else {
            resolve(NextResponse.json(
              { 
                success: false, 
                message: errorOutput || 'Session generation failed' 
              },
              { status: 500 }
            ))
          }
        }
      })

      pythonProcess.on('error', (error) => {
        clearTimeout(timeout)
        console.error('Python process error:', error)
        resolve(NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        ))
      })
    })
  } catch (error: any) {
    console.error('Session generation error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

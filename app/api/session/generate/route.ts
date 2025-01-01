import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { pendingSessions } from '../store'

export async function POST(req: Request): Promise<Response> {
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

    return new Promise<Response>((resolve) => {
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
            process: pythonProcess,
            output,
            errorOutput,
            resolve
          }
          
          // Send response indicating code is needed
          resolve(NextResponse.json({
            success: true,
            requireCode: true,
            message: 'Verification code required'
          }))
        }
      })

      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString()
        console.log('Python stderr:', text)
        errorOutput += text
      })

      pythonProcess.on('close', (code) => {
        if (!codeRequestSent) {
          clearTimeout(timeout)
          
          if (code === 0) {
            resolve(NextResponse.json({
              success: true,
              requireCode: false,
              message: 'Session generated successfully'
            }))
          } else {
            resolve(NextResponse.json(
              { 
                success: false, 
                message: 'Failed to generate session',
                error: errorOutput
              },
              { status: 500 }
            ))
          }
        }
      })

      pythonProcess.on('error', (error) => {
        clearTimeout(timeout)
        console.error('Process error:', error)
        resolve(NextResponse.json(
          { 
            success: false, 
            message: 'Failed to start session generation',
            error: error.message
          },
          { status: 500 }
        ))
      })
    })
  } catch (error: any) {
    console.error('Session generation error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to process request',
        error: error.message
      },
      { status: 500 }
    )
  }
}

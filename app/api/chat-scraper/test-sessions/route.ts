import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(): Promise<Response> {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'test_sessions.py')

    return new Promise<Response>((resolve) => {
      const pythonProcess = spawn('python', [scriptPath], {
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
            resolve(NextResponse.json({
              success: true,
              results: results.results || []
            }))
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
              code: code
            },
            { status: 500 }
          ))
        }
      })

      pythonProcess.on('error', (error) => {
        console.error('Process error:', error)
        resolve(NextResponse.json(
          { 
            success: false, 
            message: 'Failed to start test script',
            error: error.message
          },
          { status: 500 }
        ))
      })
    })
  } catch (error: any) {
    console.error('Test error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Test failed',
        error: error.message
      },
      { status: 500 }
    )
  }
}

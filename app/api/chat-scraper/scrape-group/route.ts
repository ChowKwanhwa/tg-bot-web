import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export async function POST(req: Request) {
  try {
    const { group, messageLimit = 1000 } = await req.json()

    if (!group) {
      return NextResponse.json(
        { success: false, message: 'Group name is required' },
        { status: 400 }
      )
    }

    // Get root directory
    if (process.env.VERCEL) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'This feature is not available in the cloud version. Please use the local version for scraping functionality.'
        },
        { status: 400 }
      )
    }
    
    const rootDir = path.resolve(process.cwd())
    console.log('Root directory:', rootDir)

    // Path to Python script
    const scriptPath = path.join(rootDir, 'scripts', 'scrape_messages.py')
    console.log('Script path:', scriptPath)

    // Create readable stream
    const stream = new ReadableStream({
      async start(controller) {
        let isControllerClosed = false;
        
        // Remove @ prefix if exists and clean group name
        const cleanGroupName = group.replace(/^@/, '')

        const process = spawn('python', [
          scriptPath,
          '--group', cleanGroupName,
          '--limit', messageLimit.toString()
        ])

        // Handle stdout
        process.stdout.on('data', (data) => {
          try {
            const lines = data.toString().split('\n').filter(Boolean)
            for (const line of lines) {
              if (!isControllerClosed) {
                controller.enqueue(`data: ${line}\n`)
              }
            }
          } catch (e) {
            console.error('Error processing stdout:', e)
          }
        })

        // Handle stderr
        process.stderr.on('data', (data) => {
          const message = data.toString()
          console.log('Python stderr:', message)
        })

        // Handle process exit
        process.on('close', (code) => {
          if (!isControllerClosed) {
            if (code !== 0) {
              console.error('Python script exited with code:', code)
              controller.enqueue(`data: {"type":"error","message":"Script exited with code ${code}"}\n`)
            }
            isControllerClosed = true;
            controller.close()
          }
        })
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

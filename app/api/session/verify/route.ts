import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { pendingSessions } from '../store'

// 
export async function POST(req: Request) {
  try {
    const { phoneNumber, verificationCode, password2FA } = await req.json()

    if (!phoneNumber || !verificationCode) {
      return NextResponse.json(
        { success: false, message: 'Phone number and verification code are required' },
        { status: 400 }
      )
    }

    const session = pendingSessions[phoneNumber]
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Session not found' },
        { status: 404 }
      )
    }

    console.log('Writing verification code to Python process...')
    session.scriptProcess.stdin.write(verificationCode + '\n')

    return new Promise((resolve) => {
      let output = ''
      let errorOutput = ''
      let sessionCreated = false
      let needs2FA = false
      
      session.scriptProcess.stdout.on('data', (data) => {
        const text = data.toString()
        console.log('Python stdout:', text)
        output += text

        if (text.includes('[SUCCESS] Session file created')) {
          sessionCreated = true
        }
        
        if (text.includes('[INFO] Two-factor authentication is enabled')) {
          needs2FA = true
          if (password2FA) {
            console.log('Writing 2FA password to Python process...')
            session.scriptProcess.stdin.write(password2FA + '\n')
          } else {
            resolve(NextResponse.json({ 
              success: false, 
              needs2FA: true,
              message: 'Two-factor authentication is required'
            }))
          }
        }
      })

      session.scriptProcess.stderr.on('data', (data) => {
        const text = data.toString()
        console.error('Python stderr:', text)
        errorOutput += text
      })

      session.scriptProcess.on('close', async (code) => {
        console.log('Python process exited with code:', code)
        console.log('Final output:', output)
        console.log('Error output:', errorOutput)

        if (code === 0 && sessionCreated) {
          try {
            const sessionFilePath = path.join(process.cwd(), 'sessions', `${phoneNumber}.session`)
            console.log('Reading session file from:', sessionFilePath)

            // Wait for file write to complete
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Read the session file as binary data
            const sessionContent = await fs.promises.readFile(sessionFilePath)
            console.log('Session file size:', sessionContent.length, 'bytes')

            // Convert binary data to base64 string for safe transmission
            const sessionBase64 = sessionContent.toString('base64')

            // Clean up session
            delete pendingSessions[phoneNumber]

            // Delete the session file from disk after reading
            try {
              await fs.promises.unlink(sessionFilePath)
              console.log('Session file deleted from disk')
            } catch (error) {
              console.error('Error deleting session file:', error)
            }

            resolve(NextResponse.json({
              success: true,
              sessionFile: sessionBase64
            }))
          } catch (error: any) {
            console.error('Error reading session file:', error)
            resolve(NextResponse.json(
              { success: false, message: `Failed to read session file: ${error.message}` },
              { status: 500 }
            ))
          }
        } else {
          resolve(NextResponse.json(
            { success: false, message: `Verification failed: ${errorOutput || 'Unknown error'}` },
            { status: 500 }
          ))
        }
      })
    })
  } catch (error: any) {
    console.error('Verification error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

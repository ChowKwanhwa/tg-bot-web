import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'
import path from 'path'
import fs from 'fs'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    const { email } = auth.user!
    const formData = await request.formData()
    const files = formData.getAll('files')

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No files uploaded' },
        { status: 400 }
      )
    }

    // Create user's sessions directory
    const rootDir = process.cwd()
    const userSessionsDir = path.join(rootDir, 'sessions', email)
    console.log('Route handler - creating directory:', userSessionsDir)
    
    if (!fs.existsSync(userSessionsDir)) {
      fs.mkdirSync(userSessionsDir, { recursive: true })
    }

    console.log(`Processing ${files.length} files for user ${email}...`)
    const results: Array<{ name: string; success: boolean; error?: string }> = []

    // Process each file
    for (const file of files) {
      if (!(file instanceof File)) {
        console.log('Skipping non-file item:', file)
        continue
      }

      if (!file.name.endsWith('.session')) {
        console.log('Skipping non-session file:', file.name)
        continue
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer())

        // Write file to user's sessions directory
        const filePath = path.join(userSessionsDir, file.name)
        fs.writeFileSync(filePath, buffer)
        console.log('Successfully wrote file:', file.name, 'for user:', email)
        results.push({ name: file.name, success: true })
      } catch (error) {
        console.error('Error writing file:', file.name, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        results.push({ name: file.name, success: false, error: errorMessage })
      }
    }

    // Check if any files were successfully uploaded
    const anySuccess = results.some(r => r.success)
    if (!anySuccess) {
      return NextResponse.json(
        { success: false, message: 'No files were uploaded successfully', results },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Files uploaded successfully',
      results
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'
import { mkdir } from 'fs/promises'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('sessions')

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No files uploaded' },
        { status: 400 }
      )
    }

    // Get sessions directory path
    const rootDir = process.env.VERCEL ? '/tmp' : path.resolve(process.cwd())
    const sessionsDir = path.join(rootDir, 'sessions')

    // Create sessions directory if it doesn't exist
    try {
      await mkdir(sessionsDir, { recursive: true })
    } catch (error) {
      // Ignore error if directory already exists
    }

    // Process each file
    const results = []
    for (const file of files) {
      if (!(file instanceof File)) {
        continue
      }

      // Verify file extension
      if (!file.name.endsWith('.session')) {
        results.push({
          file: file.name,
          success: false,
          message: 'Invalid file type. Only .session files are allowed.'
        })
        continue
      }

      try {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const filePath = path.join(sessionsDir, file.name)

        await writeFile(filePath, buffer)
        results.push({
          file: file.name,
          success: true
        })
      } catch (error: any) {
        results.push({
          file: file.name,
          success: false,
          message: error.message
        })
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

  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

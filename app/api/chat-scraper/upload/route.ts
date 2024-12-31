import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files')

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No files uploaded' },
        { status: 400 }
      )
    }

    // Create sessions directory if it doesn't exist
    const sessionsDir = path.join(process.cwd(), 'sessions')
    if (!existsSync(sessionsDir)) {
      await mkdir(sessionsDir, { recursive: true })
    }

    console.log(`Processing ${files.length} files...`)
    const results = []

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
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Write file to sessions directory
        const filePath = path.join(sessionsDir, file.name)
        await writeFile(filePath, buffer)
        console.log('Successfully wrote file:', file.name)
        results.push({ name: file.name, success: true })
      } catch (error) {
        console.error('Error writing file:', file.name, error)
        results.push({ name: file.name, success: false, error: error.message })
      }
    }

    return NextResponse.json({ 
      success: true,
      results,
      message: `Successfully processed ${results.filter(r => r.success).length} of ${results.length} files`
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

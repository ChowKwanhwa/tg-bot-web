import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function POST(req: Request) {
  try {
    const { filename } = await req.json()

    if (!filename) {
      return NextResponse.json(
        { success: false, message: 'Filename is required' },
        { status: 400 }
      )
    }

    // Get sessions directory path
    const rootDir = path.resolve(process.cwd())
    const sessionsDir = path.join(rootDir, 'sessions')
    const filePath = path.join(sessionsDir, filename)

    // Verify file exists and is within sessions directory
    if (!filePath.startsWith(sessionsDir) || !fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, message: 'Invalid file path' },
        { status: 400 }
      )
    }

    // Delete the file
    fs.unlinkSync(filePath)

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

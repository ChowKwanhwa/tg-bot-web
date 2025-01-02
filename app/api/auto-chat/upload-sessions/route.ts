import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'
import { mkdir } from 'fs/promises'
import { cookies } from 'next/headers'
import * as jose from 'jose'

const JWT_SECRET = new TextEncoder().encode('your-jwt-secret-key')

export async function POST(req: Request) {
  try {
    // 验证用户身份
    const cookieStore = await cookies()
    const token = await cookieStore.get('auth-token')
    
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 解析JWT获取用户邮箱
    const { payload } = await jose.jwtVerify(token.value, JWT_SECRET)
    const userEmail = payload.username as string

    if (!userEmail) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 401 }
      )
    }

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
    const userSessionsDir = path.join(rootDir, 'sessions', userEmail)

    // Create user's sessions directory if it doesn't exist
    try {
      await mkdir(userSessionsDir, { recursive: true })
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
        const filePath = path.join(userSessionsDir, file.name)

        await writeFile(filePath, buffer)
        results.push({
          file: file.name,
          success: true
        })
      } catch (error) {
        results.push({
          file: file.name,
          success: false,
          message: 'Failed to save file'
        })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error uploading sessions:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

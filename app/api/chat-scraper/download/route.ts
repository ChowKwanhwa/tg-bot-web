import { NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import path from 'path'
import archiver from 'archiver'
import { Readable } from 'stream'
import { PassThrough } from 'stream'

export async function POST(req: Request) {
  try {
    const { type, path: filePath } = await req.json()

    if (!filePath) {
      return NextResponse.json(
        { success: false, message: 'File path is required' },
        { status: 400 }
      )
    }

    // Verify file exists
    try {
      await stat(filePath)
    } catch (e) {
      return NextResponse.json(
        { success: false, message: 'File not found' },
        { status: 404 }
      )
    }

    // For CSV files, return directly
    if (type === 'csv') {
      const fileStream = createReadStream(filePath)
      const passThrough = new PassThrough()
      fileStream.pipe(passThrough)

      const response = new Response(Readable.from(passThrough))
      response.headers.set('Content-Type', 'text/csv')
      response.headers.set('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`)
      return response
    }

    // For all files, create a zip archive
    if (type === 'all') {
      const passThrough = new PassThrough()
      const archive = archiver('zip', {
        zlib: { level: 9 }
      })

      archive.pipe(passThrough)

      const folderName = path.basename(path.dirname(filePath))
      archive.directory(path.dirname(filePath), folderName)
      
      // Handle archive errors
      archive.on('error', (err) => {
        console.error('Archive error:', err)
      })

      // Finalize the archive
      archive.finalize()

      const response = new Response(Readable.from(passThrough))
      response.headers.set('Content-Type', 'application/zip')
      response.headers.set('Content-Disposition', `attachment; filename="${folderName}.zip"`)
      return response
    }

    return NextResponse.json(
      { success: false, message: 'Invalid download type' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

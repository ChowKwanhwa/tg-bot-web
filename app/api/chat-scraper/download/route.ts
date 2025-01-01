import { NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import path from 'path'
import archiver from 'archiver'
import { Readable, PassThrough } from 'stream'

export async function POST(req: Request): Promise<Response> {
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

      // Convert stream to Web-standard ReadableStream
      const readableStream = new ReadableStream({
        start(controller) {
          passThrough.on('data', (chunk) => {
            controller.enqueue(chunk)
          })
          passThrough.on('end', () => {
            controller.close()
          })
          passThrough.on('error', (err) => {
            controller.error(err)
          })
        }
      })

      const response = new Response(readableStream)
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
      const fileName = path.basename(filePath)
      
      // Add CSV file to zip
      archive.file(filePath, { name: `${folderName}/${fileName}` })
      
      // Add media folder if it exists
      const mediaPath = path.join(path.dirname(filePath), 'media')
      try {
        await stat(mediaPath)
        archive.directory(mediaPath, `${folderName}/media`)
      } catch (e) {
        // Media folder doesn't exist, skip
      }

      // Finalize the archive
      archive.finalize()

      // Convert stream to Web-standard ReadableStream
      const readableStream = new ReadableStream({
        start(controller) {
          passThrough.on('data', (chunk) => {
            controller.enqueue(chunk)
          })
          passThrough.on('end', () => {
            controller.close()
          })
          passThrough.on('error', (err) => {
            controller.error(err)
          })
        }
      })

      const response = new Response(readableStream)
      response.headers.set('Content-Type', 'application/zip')
      response.headers.set('Content-Disposition', `attachment; filename="${folderName}.zip"`)
      return response
    }

    return NextResponse.json(
      { success: false, message: 'Invalid type' },
      { status: 400 }
    )

  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to process download',
        error: error.message
      },
      { status: 500 }
    )
  }
}

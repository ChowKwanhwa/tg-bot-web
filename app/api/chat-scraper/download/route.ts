import { NextRequest } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import path from 'path'
import archiver from 'archiver'
import { Readable } from 'stream'
import { verifyAuth, handleAuthError } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.user) {
      return handleAuthError(auth.error!)
    }

    const { filePath, type } = await request.json()
    
    // 安全检查：确保文件路径在用户目录下
    const fullPath = path.join(process.cwd(), filePath)
    const userDir = path.join(process.cwd(), 'scraped_data', auth.user.email)
    
    if (!fullPath.startsWith(userDir)) {
      return new Response('Access denied', { status: 403 })
    }

    try {
      await stat(fullPath)
    } catch (error) {
      return new Response('File not found', { status: 404 })
    }

    if (type === 'csv') {
      const fileStream = createReadStream(fullPath)
      return new Response(fileStream as unknown as ReadableStream, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${path.basename(fullPath)}"`,
        },
      })
    } else if (type === 'all') {
      // 创建一个 ZIP 文件流
      const archive = archiver('zip', {
        zlib: { level: 9 }
      })

      // 设置错误处理
      archive.on('error', (err) => {
        console.error('Archiver error:', err)
      })

      // 将整个目录添加到 ZIP
      archive.directory(fullPath, false)

      // 完成打包
      archive.finalize()

      // 将 archive 流转换为 ReadableStream
      return new Response(Readable.from(archive) as unknown as ReadableStream, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${path.basename(fullPath)}.zip"`,
        },
      })
    }

    return new Response('Invalid download type', { status: 400 })
  } catch (error) {
    console.error('Download error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

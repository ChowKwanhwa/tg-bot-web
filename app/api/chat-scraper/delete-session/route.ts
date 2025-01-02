import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'
import path from 'path'
import fs from 'fs'

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 尝试删除文件，如果失败则重试
async function tryDeleteFile(filePath: string, maxRetries = 3, delayMs = 1000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.unlinkSync(filePath)
      console.log(`Successfully deleted file on attempt ${i + 1}:`, filePath)
      return
    } catch (error: any) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        console.log(`Attempt ${i + 1} failed, retrying in ${delayMs}ms...`, error.message)
        await delay(delayMs)
        continue
      }
      throw error
    }
  }
  throw new Error(`Failed to delete file after ${maxRetries} attempts`)
}

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.user) {
      return handleAuthError(auth.error!)
    }

    const { email } = auth.user!
    
    // 只读取一次请求体
    const body = await request.json()
    console.log('Request body:', body)
    
    const { sessionFile, filename } = body
    const actualSessionFile = sessionFile || filename // 支持两种参数名

    if (!actualSessionFile) {
      console.log('Missing session file in request')
      return NextResponse.json(
        { success: false, message: '缺少会话文件名' },
        { status: 400 }
      )
    }

    // 获取用户的会话目录
    const userSessionsDir = path.join('D:', 'tg-bot-web', 'sessions', email)
    const sessionPath = path.join(userSessionsDir, actualSessionFile)
    
    console.log('File paths:', {
      userSessionsDir,
      sessionPath,
      exists: fs.existsSync(sessionPath)
    })

    // 验证文件路径是否在允许的范围内
    const normalizedSessionPath = path.normalize(sessionPath)
    const normalizedBasePath = path.normalize(path.join('D:', 'tg-bot-web', 'sessions'))
    if (!normalizedSessionPath.startsWith(normalizedBasePath)) {
      console.log('Unauthorized path access:', {
        normalizedSessionPath,
        normalizedBasePath
      })
      return NextResponse.json({
        success: false,
        message: '无权访问此文件',
        details: {
          error: 'UNAUTHORIZED_ACCESS',
          path: sessionPath
        }
      }, { status: 403 })
    }

    // 检查文件是否存在
    if (!fs.existsSync(sessionPath)) {
      console.log('Session file not found:', sessionPath)
      return NextResponse.json({
        success: false,
        message: '会话文件不存在',
        details: {
          path: sessionPath
        }
      }, { status: 404 })
    }

    // 删除文件
    try {
      // 尝试删除主文件
      await tryDeleteFile(sessionPath)
      
      // 尝试删除 .session-journal 文件（如果存在）
      const journalPath = `${sessionPath}-journal`
      if (fs.existsSync(journalPath)) {
        await tryDeleteFile(journalPath)
      }

      return NextResponse.json({
        success: true,
        message: '会话文件已删除',
        details: {
          deletedFile: actualSessionFile
        }
      })
    } catch (error: any) {
      console.error('Error deleting session file:', {
        error: error.message,
        code: error.code,
        path: sessionPath
      })
      return NextResponse.json({
        success: false,
        message: error.code === 'EBUSY' 
          ? '会话文件正在使用中，请先停止所有相关操作后再试'
          : '删除会话文件失败',
        details: {
          error: error.message,
          path: sessionPath
        }
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Error in delete session route:', {
      error: error.message,
      stack: error.stack
    })
    return NextResponse.json({
      success: false,
      message: '删除会话文件失败',
      error: error.message
    }, { status: 500 })
  }
}

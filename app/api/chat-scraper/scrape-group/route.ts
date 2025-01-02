import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export const maxDuration = 900 // 设置为 15 分钟

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    const { email } = auth.user!
    const { group, messageLimit = 1000 } = await request.json()

    if (!group) {
      return NextResponse.json(
        { success: false, message: '缺少群组名称' },
        { status: 400 }
      )
    }

    // 确保用户的数据目录存在
    const userDataDir = path.join(process.cwd(), 'scraped_data', email)
    fs.mkdirSync(userDataDir, { recursive: true })

    // 获取用户的会话目录（使用绝对路径）
    const userSessionsDir = path.join('D:', 'tg-bot-web', 'sessions', email)
    console.log('Checking sessions directory:', userSessionsDir)
    
    // 检查会话目录是否存在
    if (!fs.existsSync(userSessionsDir)) {
      console.log('Sessions directory not found:', userSessionsDir)
      return NextResponse.json(
        { success: false, message: '未找到会话文件。请先上传一个会话文件。' },
        { status: 400 }
      )
    }

    // 获取所有会话文件
    const sessionFiles = fs.readdirSync(userSessionsDir)
      .filter(file => file.endsWith('.session'))
    console.log('Found session files:', sessionFiles)
    
    if (sessionFiles.length === 0) {
      return NextResponse.json(
        { success: false, message: '未找到会话文件。请先上传一个会话文件。' },
        { status: 400 }
      )
    }

    // 使用第一个可用的会话文件
    const sessionFile = sessionFiles[0]
    const sessionPath = path.join(userSessionsDir, sessionFile)
    console.log('Using session file:', sessionPath)

    // Path to Python script
    const scriptPath = path.join(process.cwd(), 'scripts', 'scrape_messages.py')
    console.log('Script path:', scriptPath)

    // Create readable stream with timeout handling
    const stream = new ReadableStream({
      async start(controller) {
        let isControllerClosed = false;
        let hasError = false;
        let lastActivityTime = Date.now();
        const TIMEOUT = 900000; // 15 分钟
        const TIMEOUT_CHECK_INTERVAL = 10000; // 每 10 秒检查一次
        const HEARTBEAT_INTERVAL = 30000; // 每 30 秒发送一次心跳

        // Heartbeat sender
        const heartbeatSender = setInterval(() => {
          if (!isControllerClosed && !hasError) {
            try {
              controller.enqueue(`data: {"type":"heartbeat","timestamp":${Date.now()}}\n\n`)
              lastActivityTime = Date.now();
            } catch (e) {
              console.log('Failed to send heartbeat:', e)
              isControllerClosed = true
              clearInterval(heartbeatSender)
            }
          } else {
            clearInterval(heartbeatSender)
          }
        }, HEARTBEAT_INTERVAL)

        // Timeout checker
        const timeoutChecker = setInterval(() => {
          const currentTime = Date.now()
          if (currentTime - lastActivityTime > TIMEOUT) {
            console.log('Connection timeout')
            clearInterval(timeoutChecker)
            clearInterval(heartbeatSender)
            if (!isControllerClosed) {
              try {
                controller.error(new Error('Connection timeout'))
              } catch (e) {
                console.log('Failed to send timeout error:', e)
              }
              isControllerClosed = true
            }
          }
        }, TIMEOUT_CHECK_INTERVAL)

        // 确保在函数结束时清理定时器
        const cleanup = () => {
          clearInterval(timeoutChecker)
          clearInterval(heartbeatSender)
        }

        // Remove @ prefix if exists and clean group name
        const cleanGroupName = group.replace(/^@/, '')

        const process = spawn('python', [
          scriptPath,
          '--session', sessionPath,
          '--group', cleanGroupName,
          '--limit', messageLimit.toString(),
          '--user-email', email,
          '--timeout', '900'  // 15 分钟
        ])

        // Handle stdout
        process.stdout.on('data', (data: Buffer) => {
          if (!isControllerClosed && !hasError) {
            try {
              lastActivityTime = Date.now();
              const lines = data.toString().split('\n').filter(Boolean)
              for (const line of lines) {
                try {
                  if (line.includes('"type":"progress"')) {
                    // 发送进度更新
                    controller.enqueue(`data: ${line}\n`)
                  } else {
                    // 其他消息
                    console.log('Python output:', line)
                    controller.enqueue(`data: ${line}\n`)
                  }
                } catch (e: any) {
                  // 如果是 controller closed 错误，只记录日志不抛出
                  if (e.code === 'ERR_INVALID_STATE') {
                    console.log('Controller is closed, skipping message:', line)
                    isControllerClosed = true
                  } else {
                    console.error('Error processing line:', e)
                  }
                }
              }
            } catch (e: any) {
              console.error('Error processing stdout:', e)
              if (!isControllerClosed) {
                hasError = true;
                try {
                  controller.error(e)
                } catch (controllerError: any) {
                  console.log('Failed to send error to controller:', controllerError)
                }
                isControllerClosed = true
                clearInterval(timeoutChecker)
                clearInterval(heartbeatSender)
              }
            }
          }
        })

        // Handle stderr
        process.stderr.on('data', (data: Buffer) => {
          if (!isControllerClosed && !hasError) {
            lastActivityTime = Date.now();
            const message = data.toString()
            console.log('Python stderr:', message)
            if (!message.includes('Successfully connected')) {
              hasError = true;
              try {
                controller.enqueue(`data: {"type":"error","message":${JSON.stringify(message)}}\n`)
              } catch (e: any) {
                console.log('Failed to send error message:', e)
              }
            }
          }
        })

        // Handle process exit
        process.on('close', (code) => {
          cleanup();
          if (!isControllerClosed && !hasError) {
            try {
              if (code !== 0) {
                console.error('Python script exited with code:', code)
                controller.enqueue(`data: {"type":"error","message":"Script exited with code ${code}"}\n`)
              } else {
                controller.enqueue(`data: {"type":"complete","message":"Scraping completed"}\n`)
              }
              controller.close()
            } catch (e) {
              console.log('Failed to handle process close:', e)
            }
            isControllerClosed = true
          }
        })

        // Handle process errors
        process.on('error', (error) => {
          cleanup();
          if (!isControllerClosed) {
            console.error('Process error:', error)
            hasError = true;
            try {
              controller.error(error)
            } catch (e) {
              console.log('Failed to send process error:', e)
            }
            isControllerClosed = true
          }
        })

        // Cleanup on stream end
        return () => {
          clearInterval(timeoutChecker)
          clearInterval(heartbeatSender)
          if (!process.killed) {
            process.kill();
          }
        };
      }
    })

    // 设置响应头以保持连接
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Keep-Alive': 'timeout=900',
      'X-Accel-Buffering': 'no'
    })

    return new Response(stream, {
      headers
    })

  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    )
  }
}

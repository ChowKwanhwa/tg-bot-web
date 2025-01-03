import { NextRequest, NextResponse } from 'next/server'
import { getJwtPayload } from '@/lib/auth'
import path from 'path'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import { writeFile } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'

// 设置更长的超时时间
export const maxDuration = 300 // 5分钟

export async function POST(req: NextRequest) {
  let photoPath = ''
  try {
    // 验证用户
    const payload = await getJwtPayload(req)
    if (!payload?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 获取请求数据
    const formData = await req.formData()
    const sessionName = formData.get('session_name')
    const firstName = formData.get('first_name')
    const lastName = formData.get('last_name')
    const username = formData.get('username')
    const photo = formData.get('photo') as File | null

    if (!sessionName) {
      return NextResponse.json({ success: false, error: 'Session name is required' }, { status: 400 })
    }

    // 构建session路径
    const sessionPath = path.join(process.cwd(), 'sessions', payload.email, `${sessionName}.session`)
    if (!sessionPath.startsWith(process.cwd())) {
      return NextResponse.json({ success: false, error: 'Invalid session path' }, { status: 400 })
    }

    if (photo) {
      // 创建用户和session特定的上传目录
      const userUploadDir = path.normalize(path.join(process.cwd(), 'uploads', payload.email, sessionName as string))
      await fs.mkdir(userUploadDir, { recursive: true })
      console.log(`[Update Profile] 创建session上传目录: ${userUploadDir}`)

      // 清理旧的头像文件
      try {
        const files = await fs.readdir(userUploadDir)
        for (const file of files) {
          if (file.startsWith('profile_pic_')) {
            const filePath = path.normalize(path.join(userUploadDir, file))
            await fs.unlink(filePath)
            console.log(`[Update Profile] 删除旧的头像文件: ${filePath}`)
          }
        }
      } catch (e) {
        console.error(`[Update Profile] 清理旧文件失败:`, e)
      }

      // 使用时间戳和随机ID来确保文件名唯一
      const timestamp = new Date().getTime()
      const originalName = (photo as File).name || 'photo.jpg'
      const fileName = `profile_pic_${timestamp}_${uuidv4()}_${originalName}`
      photoPath = path.normalize(path.join(userUploadDir, fileName))

      // 保存文件
      const bytes = await photo.arrayBuffer()
      await writeFile(photoPath, Buffer.from(bytes))
      console.log(`[Update Profile] 保存新的头像文件: ${photoPath}`)
    }

    // 准备更新配置
    const config = {
      session_name: sessionName,
      first_name: firstName,
      last_name: lastName,
      username,
      photo_path: photoPath || undefined
    }

    // 运行Python脚本
    return new Promise<Response>((resolve, reject) => {
      console.log(`[Update Profile] 开始更新用户 ${payload.email} 的账号信息，session: ${sessionName}`)
      console.log(`[Update Profile] 更新内容:`, {
        session_name: sessionName,
        first_name: firstName,
        last_name: lastName,
        username,
        has_photo: !!photo
      })

      const pythonProcess = spawn('python', [
        'scripts/update_profile.py',
        payload.email,  // 直接传递用户邮箱，而不是session路径
        JSON.stringify(config)
      ])

      let output = ''
      let errorOutput = ''

      // 设置进程超时
      const timeout = setTimeout(() => {
        pythonProcess.kill()
        console.error(`[Update Profile] 操作超时: ${payload.email}`)
        resolve(NextResponse.json({
          success: false,
          error: 'Operation timed out after 4 minutes'
        }, { status: 504 }))
      }, 240000) // 4分钟超时

      pythonProcess.stdout.on('data', (data) => {
        const message = data.toString()
        output += message
        console.log(`[Update Profile] Python输出: ${message.trim()}`)
      })

      pythonProcess.stderr.on('data', (data) => {
        const message = data.toString()
        errorOutput += message
        console.error(`[Update Profile] Python错误: ${message.trim()}`)
      })

      pythonProcess.on('close', async (code) => {
        clearTimeout(timeout)
        console.log(`[Update Profile] Python进程结束，退出码: ${code}`)

        // 如果更新失败，清理上传的文件
        if (code !== 0 && photoPath) {
          try {
            await fs.unlink(photoPath)
            console.log(`[Update Profile] 更新失败，删除上传的文件: ${photoPath}`)
          } catch (e) {
            console.error(`[Update Profile] 删除文件失败:`, e)
          }
        }

        if (code !== 0) {
          console.error(`[Update Profile] 更新失败: ${payload.email}`, errorOutput)
          resolve(NextResponse.json({
            success: false,
            error: errorOutput || 'Failed to update profile',
            code
          }, { status: 500 }))
          return
        }

        try {
          const result = JSON.parse(output)
          console.log(`[Update Profile] 更新成功: ${payload.email}`, result)
          resolve(NextResponse.json(result))
        } catch (e) {
          console.error(`[Update Profile] 解析Python输出失败:`, e)
          // 如果解析失败，也清理上传的文件
          if (photoPath) {
            try {
              await fs.unlink(photoPath)
              console.log(`[Update Profile] 解析失败，删除上传的文件: ${photoPath}`)
            } catch (err) {
              console.error(`[Update Profile] 删除文件失败:`, err)
            }
          }
          resolve(NextResponse.json({
            success: false,
            error: 'Invalid response from script',
            output
          }, { status: 500 }))
        }
      })

      // 处理进程错误
      pythonProcess.on('error', async (err) => {
        clearTimeout(timeout)
        console.error(`[Update Profile] 进程错误:`, err)
        // 如果进程出错，清理上传的文件
        if (photoPath) {
          try {
            await fs.unlink(photoPath)
            console.log(`[Update Profile] 进程错误，删除上传的文件: ${photoPath}`)
          } catch (e) {
            console.error(`[Update Profile] 删除文件失败:`, e)
          }
        }
        resolve(NextResponse.json({
          success: false,
          error: `Process error: ${err.message}`
        }, { status: 500 }))
      })
    })
  } catch (error: any) {
    console.error('Profile update error:', error)
    // 如果发生错误，确保清理上传的文件
    if (photoPath) {
      try {
        await fs.unlink(photoPath)
        console.log(`[Update Profile] 发生错误，删除上传的文件: ${photoPath}`)
      } catch (e) {
        console.error(`[Update Profile] 删除文件失败:`, e)
      }
    }
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, handleAuthError } from '@/lib/auth'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return handleAuthError(auth.error!)
    }

    const { email } = auth.user!

    // 获取用户特定的数据目录
    const userDataPath = path.join(process.cwd(), 'scraped_data', email);
    
    // 如果用户目录不存在，返回空列表
    if (!fs.existsSync(userDataPath)) {
      return NextResponse.json({ 
        success: true, 
        sources: [] 
      })
    }
    
    // 获取用户目录下的所有消息源
    const sources = fs.readdirSync(userDataPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => ({
        name: dirent.name,
        path: path.join('scraped_data', email, dirent.name, `${dirent.name}_messages.csv`)
      }));

    return NextResponse.json({ success: true, sources });
  } catch (error: any) {
    console.error('Error getting message sources:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get message sources' },
      { status: 500 }
    );
  }
}

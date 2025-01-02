import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { verifyAuth } from '@/lib/auth';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const auth = await verifyAuth(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, message: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const csvFile = formData.get('csv') as File;
    const mediaFiles = formData.getAll('media') as File[];
    const sourceName = formData.get('sourceName') as string;

    if (!csvFile || !sourceName) {
      return NextResponse.json(
        { success: false, message: 'CSV file and source name are required' },
        { status: 400 }
      );
    }

    // 创建用户特定的目录结构
    const userDir = path.join('D:', 'tg-bot-web', 'scraped_data', auth.user.email);
    const sourceDir = path.join(userDir, sourceName);
    const mediaDir = path.join(sourceDir, 'media');

    // 创建所需的目录
    await mkdir(userDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await mkdir(mediaDir, { recursive: true });

    // 保存CSV文件
    const csvBuffer = Buffer.from(await csvFile.arrayBuffer());
    const csvPath = path.join(sourceDir, `${sourceName}_messages.csv`);
    await writeFile(csvPath, csvBuffer);

    // 保存媒体文件
    const mediaResults = await Promise.all(
      mediaFiles.map(async (file) => {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const mediaPath = path.join(mediaDir, file.name);
          await writeFile(mediaPath, buffer);
          return { name: file.name, success: true };
        } catch (e: any) {
          console.error(`Error saving media file ${file.name}:`, e);
          return { name: file.name, success: false, error: e.message };
        }
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Message source uploaded successfully',
      mediaResults
    });

  } catch (error: any) {
    console.error('Error uploading message source:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to upload message source' },
      { status: 500 }
    );
  }
}

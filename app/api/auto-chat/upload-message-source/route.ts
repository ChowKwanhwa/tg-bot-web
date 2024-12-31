import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const csvFile = formData.get('csv') as File;
    const mediaFiles = formData.getAll('media') as File[];
    const sourceName = formData.get('sourceName') as string;

    if (!csvFile || !sourceName) {
      return NextResponse.json(
        { success: false, error: 'CSV file and source name are required' },
        { status: 400 }
      );
    }

    // 创建目录结构
    const sourceDir = path.join(process.cwd(), 'scraped_data', sourceName);
    const mediaDir = path.join(sourceDir, 'media');

    if (!existsSync(sourceDir)) {
      await mkdir(sourceDir, { recursive: true });
    }
    if (!existsSync(mediaDir)) {
      await mkdir(mediaDir, { recursive: true });
    }

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
      { success: false, error: error.message || 'Failed to upload message source' },
      { status: 500 }
    );
  }
}

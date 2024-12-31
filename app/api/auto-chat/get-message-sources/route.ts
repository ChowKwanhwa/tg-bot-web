import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const scrapedDataPath = path.join(process.cwd(), 'scraped_data');
    
    // Get all directories in scraped_data
    const sources = fs.readdirSync(scrapedDataPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => ({
        name: dirent.name,
        path: path.join('scraped_data', dirent.name, `${dirent.name}_messages.csv`)
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

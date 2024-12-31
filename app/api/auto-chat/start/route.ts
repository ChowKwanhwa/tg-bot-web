import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes timeout

export async function POST(req: Request) {
  try {
    const { targetGroup, isTopic, topicId, messageInterval, messageSource } = await req.json();

    // Validate input
    if (!targetGroup) {
      return NextResponse.json({ error: 'Target group is required' }, { status: 400 });
    }

    if (!messageSource) {
      return NextResponse.json({ error: 'Message source is required' }, { status: 400 });
    }

    // Parse message interval
    const [minInterval, maxInterval] = messageInterval.split('-').map(Number);
    if (isNaN(minInterval) || isNaN(maxInterval) || minInterval < 0 || maxInterval < minInterval) {
      return NextResponse.json({ error: 'Invalid message interval format' }, { status: 400 });
    }

    // Get absolute paths
    if (process.env.VERCEL) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'This feature is not available in the cloud version. Please use the local version for auto chat functionality.'
        },
        { status: 400 }
      )
    }

    const rootDir = process.cwd();
    const scriptPath = path.join(rootDir, 'scripts', 'auto_chat.py');
    const scrapedDataPath = path.join(rootDir, 'scraped_data');
    
    console.log('Root directory:', rootDir);
    console.log('Script path:', scriptPath);
    console.log('Scraped data path:', scrapedDataPath);

    // Prepare command arguments
    const args = [
      scriptPath,
      '--target-group', targetGroup,
      '--min-interval', minInterval.toString(),
      '--max-interval', maxInterval.toString(),
      '--message-source', messageSource,
      '--root-dir', rootDir  // Pass root directory to Python script
    ];

    if (isTopic) {
      args.push('--topic');
      if (topicId) {
        args.push('--topic-id', topicId.toString());
      }
    }

    console.log('Target group:', targetGroup);
    console.log('Is topic:', isTopic);
    console.log('Topic ID:', topicId);
    console.log('Message source:', messageSource);

    console.log('Running command:', 'python', args.join(' '));

    // Create response stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Write initial status
    writer.write(
      encoder.encode(`data: ${JSON.stringify({ type: 'status', message: 'Initializing Python process...\n' })}\n\n`)
    );

    // Spawn Python process
    const pythonProcess = spawn('python', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      },
      shell: true
    });

    // Log process information
    writer.write(
      encoder.encode(`data: ${JSON.stringify({ 
        type: 'status', 
        message: `Starting Python process with arguments: python ${args.join(' ')}\n` 
      })}\n\n`)
    );

    // Handle process output
    pythonProcess.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('Python stdout:', message);
      writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: 'status', message })}\n\n`)
      );
    });

    pythonProcess.stderr.on('data', (data) => {
      const message = data.toString();
      console.log('Python stderr:', message);
      writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: 'status', message })}\n\n`)
      );
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: 'status', message: `Process completed with code ${code}\n` })}\n\n`)
      );
      writer.close();
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: 'status', message: `Error: ${err.message}\n` })}\n\n`)
      );
      writer.close();
    });

    // Return streaming response
    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in auto-chat start:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

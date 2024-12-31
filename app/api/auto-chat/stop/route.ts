import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  try {
    // Get the list of Python processes
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq python.exe" /FO CSV /NH');
    
    // Parse the CSV output to get process IDs
    const processes = stdout.split('\n')
      .filter(line => line.includes('python.exe'))
      .map(line => {
        const match = line.match(/"([^"]+)"/g);
        return match ? match[1].replace(/"/g, '') : null;
      })
      .filter(pid => pid);

    // Kill each Python process
    for (const pid of processes) {
      await execAsync(`taskkill /F /PID ${pid}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Auto chat stopped successfully' 
    });
  } catch (error) {
    console.error('Error stopping auto chat:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to stop auto chat' 
    }, { 
      status: 500 
    });
  }
}

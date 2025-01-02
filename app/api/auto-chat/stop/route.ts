import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  try {
    console.log('Stopping auto chat process...');

    // 首先尝试使用 tasklist 获取 Python 进程
    const { stdout: tasklistOutput } = await execAsync('tasklist /FI "IMAGENAME eq python.exe" /FO CSV /NH');
    console.log('Tasklist output:', tasklistOutput);

    // 如果没有找到 Python 进程
    if (!tasklistOutput.includes('python.exe')) {
      console.log('No Python processes found');
      return NextResponse.json({
        success: true,
        message: 'No auto chat processes found to stop'
      });
    }

    // 获取所有 Python 进程的详细信息
    const { stdout: wmicOutput } = await execAsync('wmic process where name="python.exe" get commandline,processid');
    console.log('WMIC output:', wmicOutput);

    // 解析输出找到自动聊天进程
    const lines = wmicOutput.split('\n')
      .slice(1) // 跳过标题行
      .filter(line => line.trim())
      .filter(line => line.includes('auto_chat.py'));

    if (lines.length === 0) {
      console.log('No auto chat processes found');
      return NextResponse.json({
        success: true,
        message: 'No auto chat processes found to stop'
      });
    }

    // 提取进程 ID 并终止进程
    const killedProcesses = [];
    const errors = [];

    for (const line of lines) {
      try {
        const pidMatch = line.match(/(\d+)\s*$/);
        if (pidMatch) {
          const pid = pidMatch[1];
          console.log(`Killing process ${pid}...`);
          await execAsync(`taskkill /F /PID ${pid}`);
          killedProcesses.push(pid);
        }
      } catch (error: any) {
        console.error('Error killing process:', error);
        errors.push(error.message);
      }
    }

    if (killedProcesses.length > 0) {
      return NextResponse.json({
        success: true,
        message: `Successfully stopped ${killedProcesses.length} auto chat process(es)`,
        killedProcesses,
        errors: errors.length > 0 ? errors : undefined
      });
    } else if (errors.length > 0) {
      throw new Error(`Failed to stop processes: ${errors.join(', ')}`);
    } else {
      return NextResponse.json({
        success: true,
        message: 'No matching auto chat processes found to stop'
      });
    }
  } catch (error: any) {
    console.error('Error in stop route:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to stop auto chat',
      error: error.message,
      stack: error.stack
    }, {
      status: 500
    });
  }
}

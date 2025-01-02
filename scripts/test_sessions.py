import os
import sys
import json
import asyncio
from telethon import TelegramClient
from datetime import datetime
import argparse
from config import API_ID, API_HASH, PROXY_CONFIGS

async def test_session(session_path):
    """Test a single session file"""
    try:
        # 从session文件名中提取电话号码
        session_name = os.path.basename(session_path)
        phone = session_name.replace('.session', '')
        
        proxy_config = PROXY_CONFIGS[0]  # 使用第一个代理配置
        sys.stderr.write(f"Testing session {session_name} with proxy {proxy_config['addr']}:{proxy_config['port']}\n")
        sys.stderr.flush()
        
        client = TelegramClient(
            session_path.replace('.session', ''),
            API_ID,
            API_HASH,
            proxy={
                'proxy_type': proxy_config['proxy_type'],
                'addr': proxy_config['addr'],
                'port': proxy_config['port'],
                'username': proxy_config['username'],
                'password': proxy_config['password'],
                'rdns': True
            }
        )
        
        try:
            await client.connect()
            if not await client.is_user_authorized():
                sys.stderr.write(f"Session {session_name} is not authorized\n")
                sys.stderr.flush()
                return {
                    'id': phone,
                    'session': session_name,
                    'status': 'invalid',
                    'error': 'Not authorized',
                    'timestamp': datetime.now().isoformat()
                }
            
            me = await client.get_me()
            sys.stderr.write(f"Session {session_name} is valid (username: @{me.username})\n")
            sys.stderr.flush()
            return {
                'id': phone,
                'session': session_name,
                'status': 'valid',
                'username': me.username,
                'phone': phone,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            sys.stderr.write(f"Error testing session {session_name}: {str(e)}\n")
            sys.stderr.flush()
            return {
                'id': phone,
                'session': session_name,
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
        finally:
            try:
                await client.disconnect()
            except:
                pass
                
    except Exception as e:
        sys.stderr.write(f"Fatal error testing session {session_path}: {str(e)}\n")
        sys.stderr.flush()
        return {
            'id': os.path.basename(session_path),
            'session': os.path.basename(session_path),
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sessions-dir', required=True, help='Sessions directory path')
    args = parser.parse_args()
    
    sys.stderr.write(f"Checking sessions in directory: {args.sessions_dir}\n")
    sys.stderr.flush()
    
    if not os.path.exists(args.sessions_dir):
        sys.stderr.write(f"Sessions directory not found: {args.sessions_dir}\n")
        sys.stderr.flush()
        sys.stdout.write(json.dumps([]))
        sys.stdout.flush()
        return
        
    # 获取所有session文件
    session_files = [f for f in os.listdir(args.sessions_dir) if f.endswith('.session')]
    sys.stderr.write(f"Found {len(session_files)} session files\n")
    sys.stderr.flush()
    
    if not session_files:
        sys.stdout.write(json.dumps([]))
        sys.stdout.flush()
        return
        
    # 测试每个session文件
    results = []
    for session_file in session_files:
        session_path = os.path.join(args.sessions_dir, session_file)
        result = await test_session(session_path)
        results.append(result)
    
    # 确保只输出 JSON 到标准输出
    sys.stdout.write(json.dumps(results))
    sys.stdout.flush()

if __name__ == '__main__':
    asyncio.run(main())

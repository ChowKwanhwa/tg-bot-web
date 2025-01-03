import os
import sys
import json
import asyncio
import argparse
from telethon import TelegramClient
from config import (
    API_ID,
    API_HASH,
    PROXY_CONFIGS,
    BASE_SESSIONS_DIR
)

async def get_session_info(session_path):
    """Get user information from a session file"""
    try:
        session_name = os.path.basename(session_path)
        phone = session_name.replace('.session', '')
        
        # 使用第一个代理配置
        proxy_config = PROXY_CONFIGS[0]
        
        client = TelegramClient(
            session_path.replace('.session', ''),
            API_ID,
            API_HASH,
            proxy=proxy_config
        )
        
        try:
            await client.connect()
            
            if not await client.is_user_authorized():
                print(json.dumps({
                    "type": "error",
                    "message": "Session is not authorized",
                    "phone": phone
                }))
                return None
            
            # 获取用户信息
            me = await client.get_me()
            
            info = {
                "type": "success",
                "phone": phone,
                "first_name": me.first_name,
                "last_name": me.last_name,
                "username": me.username,
                "id": me.id
            }
            
            print(json.dumps(info))
            return info
            
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "message": str(e),
                "phone": phone
            }))
            return None
            
        finally:
            await client.disconnect()
            
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e)
        }))
        return None

async def get_all_sessions_info(user_email):
    """Get information for all sessions of a user"""
    sessions_dir = os.path.join(BASE_SESSIONS_DIR, user_email)
    
    if not os.path.exists(sessions_dir):
        print(json.dumps({
            "type": "error",
            "message": f"No sessions directory found for {user_email}"
        }))
        return []
    
    session_files = [f for f in os.listdir(sessions_dir) if f.endswith('.session')]
    
    if not session_files:
        print(json.dumps({
            "type": "error",
            "message": f"No session files found for {user_email}"
        }))
        return []
    
    results = []
    for session_file in session_files:
        session_path = os.path.join(sessions_dir, session_file)
        info = await get_session_info(session_path)
        if info:
            results.append(info)
    
    return results

async def main():
    parser = argparse.ArgumentParser(description='Get Telegram session information')
    parser.add_argument('--user-email', required=True, help='User email')
    args = parser.parse_args()
    
    try:
        await get_all_sessions_info(args.user_email)
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())

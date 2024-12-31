import os
from telethon import TelegramClient
import asyncio
import json
import sys

# Telegram API credentials
API_ID = 22453265
API_HASH = '641c3fad1c94728381a70113c70cd52d'

# Sessions directory
SESSIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sessions')

# Proxy configurations
PROXY_CONFIGS = [
    {
        'proxy_type': 'socks5',
        'addr': '119.42.39.170',
        'port': 5798,
        'username': 'Maomaomao77',
        'password': 'Maomaomao77'
    },
    {
        'addr': "86.38.26.189",
        'port': 6354,
        'username': 'binghua99',
        'password': 'binghua99'
    },
    {
        'addr': "198.105.111.87",
        'port': 6765,
        'username': 'binghua99',
        'password': 'binghua99'
    }
]

async def test_session_with_proxy(session_file, proxy_config):
    """Test a single session file with a specific proxy"""
    session_path = os.path.join(SESSIONS_DIR, session_file)
    
    try:
        # Create client with proxy
        proxy = {
            'proxy_type': 'socks5',
            **proxy_config
        }
        
        client = TelegramClient(session_path, API_ID, API_HASH, proxy=proxy)
        
        # Connect and test
        await client.connect()
        
        if await client.is_user_authorized():
            me = await client.get_me()
            username = f"@{me.username}" if me.username else str(me.id)
            await client.disconnect()
            return True, {
                'session': session_file,
                'status': 'valid',
                'username': username,
                'phone': me.phone
            }
        else:
            await client.disconnect()
            return False, {
                'session': session_file,
                'status': 'unauthorized',
                'error': 'Session not authorized'
            }
            
    except Exception as e:
        return False, {
            'session': session_file,
            'status': 'error',
            'error': str(e)
        }

async def test_session(session_file):
    """Test a session file with all available proxies"""
    for proxy in PROXY_CONFIGS:
        success, result = await test_session_with_proxy(session_file, proxy)
        if success:
            return result
    
    return {
        'session': session_file,
        'status': 'error',
        'error': 'Failed with all proxies'
    }

async def main():
    if not os.path.exists(SESSIONS_DIR):
        return json.dumps({
            'total_sessions': 0,
            'valid_sessions': 0,
            'results': []
        })
    
    session_files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith('.session')]
    
    if not session_files:
        return json.dumps({
            'total_sessions': 0,
            'valid_sessions': 0,
            'results': []
        })
    
    results = []
    for session_file in session_files:
        result = await test_session(session_file)
        results.append(result)
    
    valid = sum(1 for r in results if r['status'] == 'valid')
    
    # Only output JSON result
    print(json.dumps({
        'total_sessions': len(results),
        'valid_sessions': valid,
        'results': results
    }))

if __name__ == "__main__":
    asyncio.run(main())

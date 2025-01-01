import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from telethon import TelegramClient, events, functions, types
import csv
from datetime import datetime
import asyncio
import os
import json
import logging
from pathlib import Path
import argparse
from config import (
    API_ID,
    API_HASH,
    MEDIA_DIR,
    PROXY_CONFIGS
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('telegram_scraper.log', encoding='utf-8')
    ]
)

# Disable telethon's detailed logging
logging.getLogger('telethon').setLevel(logging.WARNING)

# Configure paths
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'scraped_data')
SESSIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sessions')

# Create necessary directories
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR, exist_ok=True)

def sanitize_filename(filename):
    """Clean filename, remove illegal characters"""
    return "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '.'))

async def download_media(message, group_folder):
    """Download media files"""
    try:
        if message.media:
            media_folder = os.path.join(group_folder, 'media')
            os.makedirs(media_folder, exist_ok=True)
            
            # Get media type and filename
            if hasattr(message.media, 'photo'):
                # Handle photos
                file_name = f"photo_{message.id}.jpg"
                media_type = "photo"
            elif hasattr(message.media, 'document'):
                # Handle documents
                if message.sticker:
                    file_name = f"sticker_{message.id}.webp"
                    media_type = "sticker"
                    # 保存sticker信息
                    document = message.media.document
                    sticker_info = {
                        'id': document.id,
                        'access_hash': document.access_hash,
                        'file_reference': document.file_reference.hex()
                    }
                    # 保存sticker信息到json文件
                    json_file_name = f"sticker_{message.id}.json"
                    json_file_path = os.path.join(media_folder, json_file_name)
                    with open(json_file_path, 'w', encoding='utf-8') as f:
                        json.dump(sticker_info, f, indent=2)
                elif message.video:
                    file_name = f"video_{message.id}.mp4"
                    media_type = "video"
                elif message.voice:
                    file_name = f"voice_{message.id}.ogg"
                    media_type = "voice"
                elif message.audio:
                    extension = message.audio.mime_type.split('/')[-1]
                    file_name = f"audio_{message.id}.{extension}"
                    media_type = "audio"
                else:
                    # Generic document
                    original_name = getattr(message.document, 'file_name', '')
                    extension = original_name.split('.')[-1] if original_name and '.' in original_name else 'bin'
                    file_name = f"doc_{message.id}.{extension}"
                    media_type = "document"
            else:
                return None
                
            # Clean filename
            file_name = sanitize_filename(file_name)
            file_path = os.path.join(media_folder, file_name)
            
            try:
                # Download using the message object directly
                await message.download_media(file_path)
                # 返回相对于group_folder的路径，使用media/作为前缀
                return f"media/{file_name}"
            except Exception as e:
                # If direct download fails, try alternative method
                try:
                    if hasattr(message.media, 'photo'):
                        # For photos, get the largest size
                        photo = message.photo
                        if photo:
                            await message.client.download_media(photo, file_path)
                            return f"media/{file_name}"
                    elif hasattr(message.media, 'document'):
                        # For documents, use document attribute
                        document = message.media.document
                        if document:
                            await message.client.download_media(document, file_path)
                            return f"media/{file_name}"
                except Exception as inner_e:
                    logging.error(f"Alternative download method failed: {str(inner_e)}")
                    
    except Exception as e:
        logging.error(f"Failed to download media: {str(e)}")
    return None

def get_message_content(message):
    """Get message content and type"""
    if message.media:
        if hasattr(message.media, 'document'):
            # Check if it's a sticker
            if message.sticker:
                return f"[STICKER] {message.file.id}", "sticker"
            return f"[FILE] {message.file.name if message.file.name else 'Unnamed file'}", "file"
        elif hasattr(message.media, 'photo'):
            return "[PHOTO]", "photo"
        elif hasattr(message.media, 'video'):
            return "[VIDEO]", "video"
        else:
            return "[OTHER MEDIA]", "media"
    else:
        return message.text, "text"

async def scrape_group(client, group_username, message_limit=1000):
    """Scrape messages from a group"""
    try:
        # Remove @ if present
        group_username = group_username.lstrip('@')
        
        # Create group folder
        group_folder = os.path.join(DATA_DIR, group_username)
        os.makedirs(group_folder, exist_ok=True)
        
        # CSV file path
        csv_file = os.path.join(group_folder, f'{group_username}_messages.csv')
        
        # Get group entity
        group_entity = await client.get_entity(group_username)
        
        # Initialize progress
        current_message = 0
        media_files = 0
        
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'date', 'type', 'content', 'media_file'])
            
            async for message in client.iter_messages(group_entity, limit=message_limit):
                # Skip messages from bots
                if hasattr(message.sender, 'bot') and message.sender.bot:
                    continue
                    
                current_message += 1
                
                # Update progress
                progress = {
                    'current': current_message,
                    'total': message_limit
                }
                print(json.dumps({'type': 'progress', 'data': progress}))
                
                # Get message content and type
                content, msg_type = get_message_content(message)
                
                # Download media if present
                media_path = None
                if message.media:
                    media_path = await download_media(message, group_folder)
                    if media_path:
                        media_files += 1
                        media_path = os.path.relpath(media_path, group_folder)
                
                # Write to CSV
                message_data = {
                    'id': message.id,
                    'date': message.date.isoformat(),
                    'type': msg_type,
                    'content': content,
                    'media_file': media_path
                }
                
                if message.media:
                    if hasattr(message.media, 'document'):
                        if message.sticker:
                            message_data['media_file'] = f'media/sticker_{message.id}.webp'
                        else:
                            original_filename = getattr(message.document, 'file_name', '')
                            message_data['media_file'] = f'media/file_{message.id}_{original_filename}'
                    elif hasattr(message.media, 'photo'):
                        message_data['media_file'] = f'media/photo_{message.id}.jpg'
                
                writer.writerow(message_data.values())
        
        # Return results
        result = {
            'group': group_username,
            'totalMessages': current_message,
            'mediaFiles': media_files,
            'csvFile': csv_file,
            'folderPath': group_folder
        }
        print(json.dumps({'type': 'result', 'data': result}))
        return result
        
    except Exception as e:
        error_msg = str(e)
        print(json.dumps({'type': 'error', 'message': error_msg}))
        raise Exception(error_msg)

async def connect_with_session(session_file):
    """Connect to Telegram using session file"""
    try:
        # Get full path to session file
        session_path = os.path.join(SESSIONS_DIR, session_file)
        
        # Try each proxy configuration
        for proxy_config in PROXY_CONFIGS:
            try:
                client = TelegramClient(
                    session_path,
                    API_ID,
                    API_HASH,
                    proxy={
                        'proxy_type': proxy_config.get('proxy_type', 'socks5'),
                        'addr': proxy_config['addr'],
                        'port': proxy_config['port'],
                        'username': proxy_config.get('username'),
                        'password': proxy_config.get('password')
                    }
                )
                
                print(json.dumps({
                    "type": "debug",
                    "message": f"Attempting to connect with proxy: {proxy_config['addr']}:{proxy_config['port']}"
                }))
                
                await client.connect()
                if await client.is_user_authorized():
                    print(json.dumps({
                        "type": "info",
                        "message": f"Successfully connected to Telegram (using proxy: {proxy_config['addr']}:{proxy_config['port']})"
                    }))
                    return client
                else:
                    print(json.dumps({
                        "type": "error",
                        "message": "Client not authorized"
                    }))
                    
            except Exception as e:
                print(json.dumps({
                    "type": "error",
                    "message": f"Connection error with proxy {proxy_config['addr']}: {str(e)}"
                }))
                continue
                
        return None
        
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": f"Failed to connect: {str(e)}"
        }))
        return None

async def main():
    parser = argparse.ArgumentParser(description='Scrape messages from Telegram group')
    parser.add_argument('--group', type=str, required=True, help='Group username or invite link')
    parser.add_argument('--limit', type=int, default=1000, help='Maximum number of messages to scrape')
    
    args = parser.parse_args()
    
    print(json.dumps({
        "type": "info",
        "message": f"Starting to scrape group: @{args.group}"
    }))
    print(json.dumps({
        "type": "info",
        "message": f"Message limit: {args.limit}"
    }))
    
    session_files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith('.session')]
    
    if not session_files:
        print(json.dumps({
            "type": "error",
            "message": "No session files found in the sessions directory"
        }))
        sys.exit(1)
    
    for session_file in session_files:
        try:
            print(json.dumps({
                "type": "info",
                "message": f"Trying session file: {session_file}"
            }))
            
            session_path = os.path.join(SESSIONS_DIR, session_file)
            
            client = None
            for proxy_config in PROXY_CONFIGS:
                try:
                    client = await connect_with_session(session_path)
                    if client:
                        break
                except Exception as e:
                    print(json.dumps({
                        "type": "error",
                        "message": f"Failed to connect using proxy {proxy_config['addr']}: {str(e)}"
                    }))
                    continue
            
            if not client:
                print(json.dumps({
                    "type": "error",
                    "message": f"Failed to connect using session file: {session_file}"
                }))
                continue
            
            result = await scrape_group(client, args.group, args.limit)
            if result:
                await client.disconnect()
                sys.exit(0)
                
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "message": str(e)
            }))
            if client:
                await client.disconnect()
            continue
    
    print(json.dumps({
        "type": "error",
        "message": "All session files failed"
    }))
    sys.exit(1)

if __name__ == "__main__":
    import sys
    import os
    
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(main())

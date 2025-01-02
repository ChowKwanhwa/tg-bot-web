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
import random
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

def get_user_sessions_dir(user_email):
    return os.path.join(SESSIONS_DIR, user_email)

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
                    # 只为贴纸保存额外信息
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

async def get_message_content(message):
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

async def connect_with_session(session_file, user_email):
    """Connect to Telegram using session file with retry mechanism"""
    MAX_RETRIES = 3
    RETRY_DELAY = 5  # seconds
    
    for attempt in range(MAX_RETRIES):
        try:
            # Select a random proxy from the list
            proxy_config = random.choice(PROXY_CONFIGS) if PROXY_CONFIGS else None
            
            client = TelegramClient(
                session_file,
                API_ID,
                API_HASH,
                proxy=proxy_config,
                connection_retries=3,
                retry_delay=3,
                timeout=300,  # 增加到 300 秒
                request_retries=3
            )
            
            await client.connect()
            
            if not await client.is_user_authorized():
                print(json.dumps({
                    "type": "error",
                    "message": "Session is not authorized"
                }))
                return None
                
            print(json.dumps({
                "type": "info",
                "message": "Successfully connected"
            }))
            return client
            
        except Exception as e:
            error_msg = str(e)
            if attempt < MAX_RETRIES - 1:
                print(json.dumps({
                    "type": "info",
                    "message": f"Connection attempt {attempt + 1} failed, retrying in {RETRY_DELAY} seconds... Error: {error_msg}"
                }))
                await asyncio.sleep(RETRY_DELAY)
                continue
            
            print(json.dumps({
                "type": "error",
                "message": f"Failed to connect with session {session_file}: {error_msg}"
            }), file=sys.stderr)
            return None
    
    print(json.dumps({
        "type": "error",
        "message": f"All connection attempts failed after {MAX_RETRIES} retries"
    }), file=sys.stderr)
    return None

async def scrape_group(client, group_username, message_limit=1000, user_email=None):
    """Scrape messages from a group with progress updates"""
    try:
        # Get the input entity with retry
        MAX_RETRIES = 3
        RETRY_DELAY = 5
        entity = None
        
        for attempt in range(MAX_RETRIES):
            try:
                entity = await client.get_input_entity(group_username)
                break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    print(json.dumps({
                        "type": "info",
                        "message": f"Failed to get entity, attempt {attempt + 1}/{MAX_RETRIES}. Retrying in {RETRY_DELAY} seconds..."
                    }))
                    await asyncio.sleep(RETRY_DELAY)
                else:
                    raise e
        
        if not entity:
            raise Exception("Failed to get group entity after all retries")
            
        # Create necessary directories
        group_folder = os.path.join(DATA_DIR, user_email, sanitize_filename(group_username))
        os.makedirs(group_folder, exist_ok=True)
        media_folder = os.path.join(group_folder, 'media')
        os.makedirs(media_folder, exist_ok=True)
        
        # CSV file path
        csv_file = os.path.join(group_folder, f'{sanitize_filename(group_username)}_messages.csv')
        
        # Get total message count with retry
        total_messages = 0
        for attempt in range(MAX_RETRIES):
            try:
                # 计算实际的总消息数
                async for _ in client.iter_messages(entity):
                    total_messages += 1
                    if total_messages >= message_limit:  # 如果达到限制就停止计数
                        break
                break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    print(json.dumps({
                        "type": "info",
                        "message": f"Failed to get message count, attempt {attempt + 1}/{MAX_RETRIES}. Retrying..."
                    }))
                    await asyncio.sleep(RETRY_DELAY)
                else:
                    raise e
        
        # 使用目标消息数量作为total
        target_messages = min(total_messages, message_limit)
        
        print(json.dumps({
            'type': 'start',
            'total': target_messages
        }))
        
        # 第一步：先抓取所有消息内容
        messages = []
        processed = 0
        last_progress = -1
        last_update_time = time.time()
        UPDATE_INTERVAL = 2  # 每2秒至少发送一次进度更新
        
        print(json.dumps({
            'type': 'info',
            'message': 'Step 1: Fetching messages...'
        }))
        
        async for message in client.iter_messages(entity, limit=message_limit):
            processed += 1
            progress = int((processed / target_messages) * 100)
            current_time = time.time()
            
            if progress != last_progress or (current_time - last_update_time) >= UPDATE_INTERVAL:
                print(json.dumps({
                    'type': 'progress',
                    'current': processed,
                    'total': target_messages,
                    'percentage': progress
                }))
                last_progress = progress
                last_update_time = current_time
            
            try:
                # 检查消息发送者是否是机器人
                if message.sender and hasattr(message.sender, 'bot') and message.sender.bot:
                    continue  # 跳过机器人的消息
                    
                content, msg_type = await get_message_content(message)
                messages.append({
                    'id': message.id,
                    'date': message.date.isoformat(),
                    'type': msg_type,
                    'content': content,
                    'media_file': ''  # 先留空，后面再处理媒体文件
                })
            except Exception as e:
                print(json.dumps({
                    'type': 'warning',
                    'message': f'Error processing message {message.id}: {str(e)}'
                }))
                continue
        
        # 写入消息到CSV
        print(json.dumps({
            'type': 'info',
            'message': 'Writing messages to CSV file...'
        }))
        
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['id', 'date', 'type', 'content', 'media_file'])
            writer.writeheader()
            writer.writerows(messages)
        
        # 在开始处理媒体文件之前，先发送结果信息
        print(json.dumps({
            'type': 'result',
            'data': {
                'group': group_username,
                'totalMessages': len(messages),
                'mediaFiles': len([msg for msg in messages if msg['type'] in ['photo', 'video', 'sticker', 'file']]),
                'csvFile': csv_file,
                'folderPath': group_folder
            }
        }))

        print(json.dumps({
            'type': 'info',
            'message': 'Step 2: Processing media files...'
        }))
        
        # 处理媒体文件
        media_messages = [msg for msg in messages if msg['type'] in ['photo', 'video', 'sticker', 'file']]
        for i, msg in enumerate(media_messages, 1):
            try:
                print(json.dumps({
                    'type': 'progress',
                    'current': i,
                    'total': len(media_messages),
                    'percentage': int((i / len(media_messages)) * 100),
                    'message': f'Processing media file {i}/{len(media_messages)}'
                }))
                
                # 获取原始消息对象
                msg_obj = await client.get_messages(entity, ids=msg['id'])
                if msg_obj and msg_obj.media:
                    media_path = await download_media(msg_obj, group_folder)
                    if media_path:
                        msg['media_file'] = media_path
            except Exception as e:
                print(json.dumps({
                    'type': 'warning',
                    'message': f'Failed to process media for message {msg["id"]}: {str(e)}'
                }))
        
        # 更新CSV中的媒体文件路径
        print(json.dumps({
            'type': 'info',
            'message': 'Updating CSV with media file paths...'
        }))
        
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['id', 'date', 'type', 'content', 'media_file'])
            writer.writeheader()
            writer.writerows(messages)
        
        # 发送完成消息，包含更多信息
        print(json.dumps({
            'type': 'complete',
            'message': 'Successfully scraped messages',
            'csv_file': csv_file
        }))
        
    except Exception as e:
        print(json.dumps({
            'type': 'error',
            'message': str(e)
        }))
        raise e

async def main():
    parser = argparse.ArgumentParser(description='Scrape messages from Telegram group')
    parser.add_argument('--session', required=True, help='Path to session file')
    parser.add_argument('--group', required=True, help='Group username or ID')
    parser.add_argument('--limit', type=int, default=1000, help='Maximum number of messages to scrape')
    parser.add_argument('--user-email', required=True, help='User email for organizing data')
    parser.add_argument('--timeout', type=int, default=90, help='Timeout in seconds')
    
    args = parser.parse_args()
    
    try:
        client = await connect_with_session(args.session, args.user_email)
        await scrape_group(client, args.group, args.limit, args.user_email)
    except Exception as e:
        logging.error(f"Error: {str(e)}")
        sys.exit(1)
    finally:
        try:
            await client.disconnect()
        except:
            pass

if __name__ == "__main__":
    import sys
    import os
    import time
    
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(main())

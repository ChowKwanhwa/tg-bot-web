import sys
import subprocess
import io
import itertools
import json
import os
import pandas as pd
from telethon import TelegramClient, types
import asyncio
import random
from telethon.tl.types import InputPeerChannel, ReactionEmoji, DocumentAttributeVideo, DocumentAttributeAnimated
from telethon.tl.functions.messages import GetHistoryRequest, SendReactionRequest
import emoji
from telethon.tl.functions.channels import JoinChannelRequest
import argparse
from config import (
    API_ID,
    API_HASH,
    SESSIONS_DIR,
    MEDIA_DIR,
    REACTION_EMOJIS,
    PROXY_CONFIGS
)

# Set UTF-8 as default encoding for stdout
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def check_dependencies():
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("All dependencies installed successfully!")
    except Exception as e:
        print(f"Error installing dependencies: {str(e)}")
        sys.exit(1)

# Check and install dependencies
check_dependencies()

def parse_args():
    parser = argparse.ArgumentParser(description='Auto chat script')
    parser.add_argument('--target-group', required=True, help='Target group URL or username')
    parser.add_argument('--topic', action='store_true', help='Whether the group has topics')
    parser.add_argument('--topic-id', type=int, help='Topic ID for topic groups')
    parser.add_argument('--min-interval', type=float, required=True, help='Minimum interval between messages')
    parser.add_argument('--max-interval', type=float, required=True, help='Maximum interval between messages')
    parser.add_argument('--message-source', required=True, help='Name of the message source folder')
    parser.add_argument('--root-dir', required=True, help='Root directory of the project')
    return parser.parse_args()

async def try_connect_with_proxy(session_file, proxy_config):
    """Try to connect using specific proxy"""
    client = None
    try:
        print(f"Checking directory: {SESSIONS_DIR}")
        if not os.path.exists(SESSIONS_DIR):
            print(f"Creating directory: {SESSIONS_DIR}")
            os.makedirs(SESSIONS_DIR)
            
        session_path = os.path.join(SESSIONS_DIR, session_file.replace('.session', ''))
        print(f"Using session path: {session_path}")
        
        client = TelegramClient(
            session_path, 
            API_ID, 
            API_HASH, 
            proxy=proxy_config,
            connection_retries=3,
            retry_delay=1
        )
        
        print(f"Attempting to connect using proxy {proxy_config['addr']}:{proxy_config['port']}...")
        await client.connect()
        
        if await client.is_user_authorized():
            me = await client.get_me()
            print(f"[SUCCESS] Connected successfully using proxy {proxy_config['addr']}!")
            print(f"       Account: {me.first_name} (@{me.username})")
            return client
        
        await client.disconnect()
        print(f"[FAILED] Connection failed using proxy {proxy_config['addr']}: Not authorized")
        return None
        
    except Exception as e:
        print(f"[FAILED] Connection failed using proxy {proxy_config['addr']}: {str(e)}")
        try:
            if client:
                await client.disconnect()
        except:
            pass
        return None

async def init_clients():
    """Initialize all clients with proxy rotation"""
    try:
        print(f"Checking sessions directory: {SESSIONS_DIR}")
        if not os.path.exists(SESSIONS_DIR):
            print("Sessions directory does not exist")
            return []
            
        session_files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith('.session')]
        print(f"Found {len(session_files)} session files: {session_files}")
        
        if not session_files:
            print("No session files found")
            return []
            
        clients = []
        
        for session_file in session_files:
            client = None
            # Try all proxies
            for proxy in PROXY_CONFIGS:
                client = await try_connect_with_proxy(session_file, proxy)
                if client:
                    clients.append(client)
                    break
            
            if not client:
                print(f"Warning: {session_file} failed to connect with all proxies!")
        
        return clients
        
    except Exception as e:
        print(f"Error initializing clients: {str(e)}")
        return []

async def join_group(client, target_group):
    try:
        print(f"Attempting to join group: {target_group}")
        await client(JoinChannelRequest(target_group))
        print(f"Successfully joined {target_group}")
    except Exception as e:
        print(f"Failed to join group: {str(e)}")

async def get_recent_messages(client, target_group, limit=5, use_topic=False, topic_id=None):
    try:
        print(f"Getting recent messages - Group: {target_group}, Topic mode: {use_topic}, Topic ID: {topic_id}")
        channel = await client.get_entity(target_group)
        messages = []
        kwargs = {}
        if use_topic:
            kwargs['reply_to'] = topic_id
        async for message in client.iter_messages(channel, limit=limit, **kwargs):
            messages.append(message)
        print(f"Successfully retrieved {len(messages)} messages")
        return messages[::-1]  # Reverse message list
    except Exception as e:
        print(f"Failed to get messages: {str(e)}")
        return []

async def get_sticker_from_message(client, message_data):
    """Get sticker object from message"""
    try:
        media_file = message_data.get('media_file')
        if not media_file or pd.isna(media_file):
            return None
            
        # Load sticker info from JSON file
        sticker_info_path = os.path.join(os.path.dirname(media_file), media_file)
        with open(sticker_info_path, 'r') as f:
            sticker_info = json.load(f)
            
        # Create InputDocument for the sticker
        return types.InputDocument(
            id=int(sticker_info['id']),
            access_hash=int(sticker_info['access_hash']),
            file_reference=bytes.fromhex(sticker_info['file_reference'])
        )
    except Exception as e:
        print(f"Error getting sticker: {str(e)}")
    return None

async def process_message(client, message_data, target_group, recent_messages, use_topic, topic_id, media_dir):
    """Process a single message"""
    try:
        message_type = message_data['type']
        
        # 准备发送参数
        send_kwargs = {}
        if use_topic:
            send_kwargs['reply_to'] = topic_id
        
        # 如果有回复消息，添加回复参数
        if 'reply_to' in message_data and not pd.isna(message_data['reply_to']):
            reply_id = int(message_data['reply_to'])
            if reply_id in recent_messages:
                send_kwargs['reply_to'] = recent_messages[reply_id]
        
        if message_type == 'text':
            content = message_data['content']
            if pd.isna(content):
                return None
            
            sent_message = await client.send_message(target_group, content, **send_kwargs)
            return sent_message
            
        elif message_type == 'sticker':
            # 直接使用贴纸信息发送
            sticker = await get_sticker_from_message(client, message_data)
            if sticker:
                sent_message = await client.send_file(
                    target_group,
                    sticker,
                    **send_kwargs
                )
                print(f"Sent sticker")
                return sent_message
            else:
                print(f"Failed to get sticker, skipping")
                return None
                
        elif message_type in ['photo', 'file', 'video']:
            media_file = message_data.get('media_file')
            if media_file and not pd.isna(media_file):
                # 从media_file中提取文件名
                media_filename = os.path.basename(media_file)
                # 构建完整的媒体文件路径
                media_path = os.path.join(media_dir, media_filename)
                
                print(f"Trying to send media file: {media_path}")
                
                if os.path.exists(media_path):
                    try:
                        file_ext = os.path.splitext(media_path)[1].lower()
                        
                        if file_ext == '.webm':
                            # Send as video message with proper attributes
                            await client.send_file(
                                target_group,
                                media_path,
                                attributes=[
                                    DocumentAttributeVideo(
                                        duration=0,
                                        w=200,  # width
                                        h=200,  # height
                                        round_message=True,
                                        supports_streaming=True
                                    )
                                ],
                                **send_kwargs
                            )
                            print(f"Sent video message: {media_path}")
                            return None
                        elif file_ext in ['.jpg', '.jpeg', '.png']:
                            # Send as photo
                            sent_message = await client.send_file(
                                target_group,
                                media_path,
                                **send_kwargs
                            )
                            print(f"Sent photo: {media_path}")
                            return sent_message
                        elif file_ext in ['.mp4', '.gif.mp4']:
                            # Send as video
                            sent_message = await client.send_file(
                                target_group,
                                media_path,
                                **send_kwargs
                            )
                            print(f"Sent video: {media_path}")
                            return sent_message
                        else:
                            # Other files normal send
                            sent_message = await client.send_file(
                                target_group,
                                media_path,
                                **send_kwargs
                            )
                            print(f"Sent media: {media_path}")
                            return sent_message
                    except Exception as e:
                        print(f"Failed to send media: {str(e)}")
                        print(f"File exists: {os.path.exists(media_path)}")
                        print(f"File size: {os.path.getsize(media_path) if os.path.exists(media_path) else 'N/A'}")
                else:
                    print(f"Media file not found: {media_path}")
                    print(f"Current directory: {os.getcwd()}")
                    print(f"Media directory contents: {os.listdir(media_dir)}")
            
        return None
    except Exception as e:
        print(f"Error processing message: {str(e)}")
        return None

async def run_chat_loop(clients, df, args, media_dir):
    """Run the main chat loop"""
    try:
        target_group = args.target_group
        use_topic = args.topic
        topic_id = args.topic_id if use_topic else None
        min_interval = args.min_interval
        max_interval = args.max_interval

        # Create client cycle
        client_cycle = itertools.cycle(clients)
        
        # Dictionary to store recent message IDs
        recent_messages = {}
        
        # Create message iterator
        message_index = 0
        total_messages = len(df)
        
        # Main loop
        while True:
            # Check if we've processed all messages
            if message_index >= total_messages:
                print("All messages have been processed")
                break
                
            # Sleep for random interval
            interval = random.uniform(min_interval, max_interval)
            await asyncio.sleep(interval)
            
            # Get next client and message
            current_client = next(client_cycle)
            current_message = df.iloc[message_index]
            
            # Process the message
            sent_message = await process_message(
                current_client,
                current_message,
                target_group,
                recent_messages,
                use_topic,
                topic_id,
                media_dir
            )
            
            # Store sent message ID if successful
            if sent_message:
                recent_messages[current_message['id']] = sent_message.id
            
            # Increment message counter
            message_index += 1
            print(f"Processed message {message_index}/{total_messages}")
            
    except Exception as e:
        print(f"Error in chat loop: {str(e)}")

async def main():
    try:
        # Parse command line arguments
        args = parse_args()
        print(f"Starting auto chat with arguments: {args}")

        # Load messages from the specified source
        source_dir = os.path.join(args.root_dir, 'scraped_data', args.message_source)
        messages_file = os.path.join(source_dir, f'{args.message_source}_messages.csv')
        media_dir = os.path.join(source_dir, 'media')

        print(f"Source directory: {source_dir}")
        print(f"Messages file: {messages_file}")
        print(f"Media directory: {media_dir}")

        if not os.path.exists(messages_file):
            print(f"Error: Messages file not found: {messages_file}")
            return

        if not os.path.exists(media_dir):
            print(f"Warning: Media directory not found: {media_dir}")
            return

        # Load messages
        df = pd.read_csv(messages_file)
        # Reverse the order to process from oldest to newest
        df = df.iloc[::-1].reset_index(drop=True)
        print(f"Loaded {len(df)} messages")

        # Initialize clients
        clients = await init_clients()
        if not clients:
            print("No valid clients found")
            return

        print(f"Initialized {len(clients)} clients")
        await run_chat_loop(clients, df, args, media_dir)

    except Exception as e:
        print(f"Error in main: {str(e)}")
        print(f"Current working directory: {os.getcwd()}")
        print(f"Root directory: {args.root_dir}")

if __name__ == "__main__":
    asyncio.run(main())

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

async def get_sticker_from_message(client, message_data, media_dir):
    """Get sticker object from message"""
    try:
        media_file = message_data.get('media_file')
        if not media_file or pd.isna(media_file):
            return None
            
        # 处理 media_file 路径，确保正确的格式
        if media_file.startswith('media/'):
            media_file = media_file[6:]  # 去掉 'media/' 前缀
            
        # 构建 JSON 文件路径 (将 .webp 替换为 .json)
        base_name = os.path.splitext(media_file)[0]
        json_path = os.path.join(media_dir, base_name + '.json')
        
        print(f"\nDebug sticker info:")
        print(f"Looking for sticker info at: {json_path}")
        
        if not os.path.exists(json_path):
            print(f"Sticker info not found: {json_path}")
            return None
            
        # 加载 sticker 信息
        with open(json_path, 'r') as f:
            sticker_info = json.load(f)
            print(f"Loaded sticker info: {sticker_info}")
            
        # 创建 InputDocument
        input_doc = types.InputDocument(
            id=int(sticker_info['id']),
            access_hash=int(sticker_info['access_hash']),
            file_reference=bytes.fromhex(sticker_info['file_reference'])
        )
        print(f"Created InputDocument with id: {input_doc.id}")
        return input_doc
        
    except Exception as e:
        print(f"Error getting sticker: {str(e)}")
        traceback.print_exc()
    return None

async def process_message(client, message_data, target_group, recent_messages, topic_id=None, media_dir=None):
    """Process a single message"""
    try:
        channel = await client.get_entity(target_group)
        
        # 基础发送参数
        kwargs = {}
        if topic_id:  # 如果指定了topic_id，所有消息都需要发送到对应的topic
            kwargs['reply_to'] = topic_id
            
        random_value = random.random()
        
        # 25% 概率回复消息
        if random_value < 0.25 and recent_messages:
            target_message = recent_messages[-1]  # 回复最新消息
            kwargs['reply_to'] = target_message.id
        
        # 15% 概率添加表情回应
        elif random_value < 0.40 and recent_messages:  # 0.25 + 0.15 = 0.40
            target_message = recent_messages[-1]
            reaction = random.choice(REACTION_EMOJIS)
            try:
                await client(SendReactionRequest(
                    peer=channel,
                    msg_id=target_message.id,
                    reaction=[ReactionEmoji(emoticon=reaction)]
                ))
                me = await client.get_me()
                print(f"[{me.first_name}] Reacted with {reaction} to message {target_message.id}")
            except Exception as e:
                print(f"Failed to add reaction: {str(e)}")
            return
            
        # 发送消息（包括普通发送和回复）
        if message_data['type'] in ['photo', 'file', 'sticker']:
            print(f"\nDebug media paths:")
            print(f"media_dir: {media_dir}")
            print(f"media_file from message_data: {message_data['media_file']}")
            
            # 检查media_file是否为空或NaN
            if pd.isna(message_data['media_file']):
                print("Warning: media_file is NaN")
                return
                
            # 获取media_file，确保不重复media路径
            media_file = message_data['media_file']
            if media_file.startswith('media/') or media_file.startswith('media\\'):
                # 移除开头的media/或media\
                media_file = os.path.join(*os.path.normpath(media_file).split(os.path.sep)[1:])
                
            # 构建完整路径
            media_path = os.path.normpath(os.path.join(media_dir, media_file))
            print(f"Constructed media_path: {media_path}")
            print(f"File exists: {os.path.exists(media_path)}")
            
            if os.path.exists(media_path):
                # 检查文件扩展名
                file_ext = os.path.splitext(media_path)[1].lower()
                print(f"File extension: {file_ext}")
                
                if message_data['type'] == 'sticker':
                    # 尝试使用 sticker ID 发送
                    sticker = await get_sticker_from_message(client, message_data, media_dir)
                    if sticker:
                        try:
                            # 创建 InputMediaDocument
                            media = types.InputMediaDocument(
                                id=sticker,
                                ttl_seconds=None,
                                spoiler=False
                            )
                            
                            # 使用 send_media 发送 sticker
                            await client.send_message(
                                channel,
                                message="",  # 空消息文本
                                file=media,  # 使用 media 参数
                                **kwargs
                            )
                            print(f"Sent sticker using ID: {sticker.id}")
                            return
                        except Exception as e:
                            print(f"Failed to send sticker using ID, falling back to file: {str(e)}")
                            traceback.print_exc()
                    
                    # 如果使用 ID 发送失败，尝试直接发送文件
                    try:
                        await client.send_file(
                            channel,
                            media_path,
                            force_document=True,  # 强制作为文档发送
                            **kwargs
                        )
                        print(f"Sent sticker as file: {media_path}")
                        return
                    except Exception as e:
                        print(f"Failed to send sticker as file: {str(e)}")
                        traceback.print_exc()
                        return
                        
                elif message_data['type'] == 'photo':
                    await client.send_file(
                        channel,
                        media_path,
                        **kwargs
                    )
                else:  # file
                    await client.send_file(
                        channel,
                        media_path,
                        **kwargs
                    )
            else:
                print(f"Media file not found: {media_path}")
                # 打印当前工作目录以便调试
                print(f"Current working directory: {os.getcwd()}")
                return
                
        elif message_data['type'] == 'text':
            await client.send_message(
                channel,
                message_data['content'],
                **kwargs
            )
            
        me = await client.get_me()
        print(f"[{me.first_name}] Sent message: {message_data['content'][:50]}...")
        
    except Exception as e:
        print(f"Failed to process message: {str(e)}")

async def run_chat_loop(clients, df, args, media_dir):
    """Run the main chat loop"""
    try:
        target_group = args.target_group
        use_topic = args.topic
        topic_id = args.topic_id if use_topic else None
        min_interval = args.min_interval
        max_interval = args.max_interval
        
        print(f"\nDebug media_dir in run_chat_loop:")
        print(f"media_dir: {media_dir}")
        print(f"media_dir exists: {os.path.exists(media_dir)}")
        print(f"media_dir is absolute: {os.path.isabs(media_dir)}")

        # Create client cycle
        client_cycle = itertools.cycle(clients)
        
        # Create message iterator
        message_index = 0
        total_messages = len(df)
        
        # Main loop
        while True:
            # Check if we've processed all messages
            if message_index >= total_messages:
                print("所有消息处理完成")
                break
                
            # Sleep for random interval
            interval = random.uniform(min_interval, max_interval)
            await asyncio.sleep(interval)
            
            # Get next client and message
            current_client = next(client_cycle)
            current_message = df.iloc[message_index]
            
            # Get recent messages for context
            recent_messages = await get_recent_messages(
                current_client,
                target_group,
                use_topic=use_topic,
                topic_id=topic_id
            )
            
            # Process message
            await process_message(
                current_client,
                current_message,
                target_group,
                recent_messages,
                topic_id=topic_id,
                media_dir=media_dir  # 确保传递 media_dir
            )
            
            message_index += 1
            
    except Exception as e:
        print(f"聊天循环出错: {str(e)}")
        raise e

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

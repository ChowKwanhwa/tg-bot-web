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
    BASE_SESSIONS_DIR as SESSIONS_DIR,
    MEDIA_DIR,
    REACTION_EMOJIS,
    PROXY_CONFIGS
)

# 立即输出启动信息
print("=== Auto Chat Script Starting ===")
print(f"Python version: {sys.version}")
print(f"Current working directory: {os.getcwd()}")
print(f"Script directory: {os.path.dirname(os.path.abspath(__file__))}")
sys.stdout.flush()  # 确保立即输出

# Set UTF-8 as default encoding for stdout
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def check_dependencies():
    """检查所需的包是否已安装"""
    required_packages = {
        'telethon': 'Telethon',
        'pandas': 'pandas',
        'emoji': 'emoji',
        'python_socks': 'python-socks[asyncio]'
    }
    
    missing_packages = []
    
    for import_name, package_name in required_packages.items():
        try:
            __import__(import_name)
            print(f"Package {package_name} is installed")
        except ImportError as e:
            print(f"Failed to import {package_name}: {str(e)}")
            missing_packages.append(package_name)
    
    if missing_packages:
        print("\nMissing required packages:", ", ".join(missing_packages))
        print("Please install them using: pip install -r requirements.txt")
        sys.exit(1)
    else:
        print("\nAll required packages are installed")

# Check dependencies
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
    parser.add_argument('--user-email', required=True, help='User email for session directory')
    return parser.parse_args()

async def try_connect_with_proxy(session_file, proxy_config, user_email):
    """Try to connect using specific proxy"""
    client = None
    try:
        print(f"\nTrying to connect with session {session_file} using proxy {proxy_config['addr']}:{proxy_config['port']}")
        
        # 构建完整的session文件路径
        session_path = os.path.join(SESSIONS_DIR, user_email, session_file)
        print(f"Session file path: {session_path}")
        print(f"Session file exists: {os.path.exists(session_path)}")
        
        # 创建代理配置
        proxy = {
            'proxy_type': proxy_config['proxy_type'],
            'addr': proxy_config['addr'],
            'port': proxy_config['port'],
            'username': proxy_config['username'],
            'password': proxy_config['password'],
            'rdns': True
        }
        
        # 创建客户端
        client = TelegramClient(
            session_path,
            API_ID,
            API_HASH,
            proxy=proxy
        )
        
        print("Connecting to Telegram...")
        await client.connect()
        
        if not await client.is_user_authorized():
            print(f"[FAILED] Session {session_file} is not authorized")
            await client.disconnect()
            return None
            
        me = await client.get_me()
        print(f"[SUCCESS] Connected successfully with {session_file}")
        print(f"       Account: {me.first_name} (@{me.username})")
        return client
        
    except Exception as e:
        print(f"[FAILED] Connection failed for {session_file} using proxy {proxy_config['addr']}: {str(e)}")
        if client:
            try:
                await client.disconnect()
            except:
                pass
        return None

async def init_clients(user_email):
    """Initialize all clients with proxy rotation"""
    try:
        # 构建用户特定的session目录
        user_sessions_dir = os.path.join(SESSIONS_DIR, user_email)
        print(f"\nInitializing clients for user: {user_email}")
        print(f"Sessions directory: {user_sessions_dir}")
        print(f"Sessions directory exists: {os.path.exists(user_sessions_dir)}")
        print(f"Current working directory: {os.getcwd()}")
        
        if not os.path.exists(user_sessions_dir):
            print(f"Creating sessions directory: {user_sessions_dir}")
            os.makedirs(user_sessions_dir, exist_ok=True)
            
        session_files = [f for f in os.listdir(user_sessions_dir) if f.endswith('.session')]
        print(f"\nFound {len(session_files)} session files:")
        for sf in session_files:
            print(f" - {sf}")
        
        if not session_files:
            print("\nNo session files found. Please generate sessions first.")
            return []
            
        print("\nTesting proxy configurations:")
        for i, proxy in enumerate(PROXY_CONFIGS):
            print(f" {i+1}. {proxy['proxy_type']}://{proxy['addr']}:{proxy['port']}")
            
        clients = []
        successful_clients = 0
        
        for session_file in session_files:
            print(f"\nTrying to connect with session: {session_file}")
            client = None
            
            # Try all proxies
            for proxy in PROXY_CONFIGS:
                client = await try_connect_with_proxy(session_file, proxy, user_email)
                if client:
                    clients.append(client)
                    successful_clients += 1
                    print(f"Successfully connected {successful_clients}/{len(session_files)} clients")
                    break
            
            if not client:
                print(f"Warning: {session_file} failed to connect with all proxies!")
        
        print(f"\nClient initialization complete:")
        print(f"Total sessions: {len(session_files)}")
        print(f"Successful connections: {successful_clients}")
        
        return clients
        
    except Exception as e:
        print(f"Error initializing clients: {str(e)}")
        import traceback
        traceback.print_exc()
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
        print(f"\nProcessing message data:")
        print(f"Type: {message_data['type']}")
        print(f"Content: {message_data['content'][:50]}..." if not pd.isna(message_data['content']) else "No content")
        print(f"Media file: {message_data['media_file']}" if not pd.isna(message_data['media_file']) else "No media")
        print(f"Topic ID: {topic_id}")
        
        # 获取目标群组实体
        try:
            channel = await client.get_entity(target_group)
            print(f"Successfully got channel entity: {channel.title}")
        except Exception as e:
            print(f"Failed to get channel entity: {str(e)}")
            raise
        
        # 基础发送参数
        kwargs = {}
        if topic_id:  # 如果指定了topic_id，所有消息都需要发送到对应的topic
            kwargs['reply_to'] = topic_id
            print(f"Setting reply_to topic: {topic_id}")
            
        random_value = random.random()
        print(f"Random value for interaction: {random_value}")
        
        # 25% 概率回复消息
        if random_value < 0.25 and recent_messages:
            target_message = recent_messages[-1]  # 回复最新消息
            kwargs['reply_to'] = target_message.id
            print(f"Will reply to message: {target_message.id}")
        
        # 15% 概率添加表情回应
        elif random_value < 0.40 and recent_messages:  # 0.25 + 0.15 = 0.40
            target_message = recent_messages[-1]
            reaction = random.choice(REACTION_EMOJIS)
            print(f"Will react with {reaction} to message: {target_message.id}")
            try:
                await client(SendReactionRequest(
                    peer=channel,
                    msg_id=target_message.id,
                    reaction=[ReactionEmoji(emoticon=reaction)]
                ))
                me = await client.get_me()
                print(f"[{me.first_name}] Successfully reacted with {reaction}")
                return
            except Exception as e:
                print(f"Failed to add reaction: {str(e)}")
                traceback.print_exc()
            return
            
        # 发送消息（包括普通发送和回复）
        if message_data['type'] in ['photo', 'file', 'sticker']:
            print(f"\nProcessing media message:")
            print(f"Media directory: {media_dir}")
            print(f"Media type: {message_data['type']}")
            
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
            print(f"Full media path: {media_path}")
            print(f"File exists: {os.path.exists(media_path)}")
            
            if os.path.exists(media_path):
                # 检查文件扩展名
                file_ext = os.path.splitext(media_path)[1].lower()
                print(f"File extension: {file_ext}")
                
                if message_data['type'] == 'sticker':
                    print("Processing sticker...")
                    # 尝试使用 sticker ID 发送
                    sticker = await get_sticker_from_message(client, message_data, media_dir)
                    if sticker:
                        try:
                            print(f"Got sticker ID: {sticker.id}")
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
                            print(f"Successfully sent sticker using ID: {sticker.id}")
                            return
                        except Exception as e:
                            print(f"Failed to send sticker using ID: {str(e)}")
                            traceback.print_exc()
                    
                    # 如果使用 ID 发送失败，尝试直接发送文件
                    print("Falling back to sending sticker as file...")
                    try:
                        await client.send_file(
                            channel,
                            media_path,
                            force_document=True,  # 强制作为文档发送
                            **kwargs
                        )
                        print(f"Successfully sent sticker as file: {media_path}")
                        return
                    except Exception as e:
                        print(f"Failed to send sticker as file: {str(e)}")
                        traceback.print_exc()
                        return
                        
                elif message_data['type'] == 'photo':
                    print("Sending photo...")
                    await client.send_file(
                        channel,
                        media_path,
                        **kwargs
                    )
                    print("Successfully sent photo")
                else:  # file
                    print("Sending file...")
                    await client.send_file(
                        channel,
                        media_path,
                        **kwargs
                    )
                    print("Successfully sent file")
            else:
                print(f"Error: Media file not found: {media_path}")
                print(f"Current working directory: {os.getcwd()}")
                return
                
        elif message_data['type'] == 'text':
            print("Sending text message...")
            if pd.isna(message_data['content']):
                print("Error: Message content is empty")
                return
                
            await client.send_message(
                channel,
                message_data['content'],
                **kwargs
            )
            print("Successfully sent text message")
            
        me = await client.get_me()
        content_preview = message_data['content'][:50] if not pd.isna(message_data['content']) else "[Media message]"
        print(f"[{me.first_name}] Successfully sent message: {content_preview}...")
        
    except Exception as e:
        print(f"Failed to process message: {str(e)}")
        traceback.print_exc()
        raise  # 重新抛出异常，让上层函数处理

async def run_chat_loop(clients, df, args, media_dir):
    """运行主聊天循环"""
    print("\nStarting chat loop...")
    
    if not clients:
        print("Error: No clients available")
        return
        
    if df.empty:
        print("Error: No messages to send (DataFrame is empty)")
        return
        
    try:
        # 获取目标群组
        target_group = args.target_group
        print(f"Connecting to target group: {target_group}")
        
        # 连接到群组
        active_clients = []
        for client in clients:
            try:
                await join_group(client, target_group)
                print(f"Successfully joined group with client {client.session.filename}")
                active_clients.append(client)
            except Exception as e:
                print(f"Error joining group with client {client.session.filename}: {str(e)}")
                continue
                
        if not active_clients:
            print("Error: No clients could join the target group")
            return
            
        # 反转DataFrame的顺序，从最后一条开始发送
        df = df.iloc[::-1].reset_index(drop=True)
        
        print(f"\nStarting message loop with {len(active_clients)} active clients")
        print(f"Total messages to send: {len(df)}")
        print("Messages will be sent from newest to oldest")
        
        # 开始消息循环
        message_count = 0
        for index, row in df.iterrows():
            try:
                # 随机选择一个客户端
                client = random.choice(active_clients)
                me = await client.get_me()
                print(f"\nProcessing message {index + 1}/{len(df)} (from newest)")
                print(f"Using client: {me.username} ({client.session.filename})")
                
                # 获取最近消息用于上下文
                try:
                    recent_messages = await get_recent_messages(
                        client, 
                        target_group,
                        use_topic=args.topic,
                        topic_id=args.topic_id
                    )
                    print(f"Retrieved {len(recent_messages)} recent messages for context")
                except Exception as e:
                    print(f"Error getting recent messages: {str(e)}")
                    recent_messages = []
                
                # 检查消息数据
                if pd.isna(row['content']) and pd.isna(row['media']):
                    print("Warning: Empty message data, skipping...")
                    continue
                    
                # 处理并发送消息
                try:
                    await process_message(
                        client,
                        row,
                        target_group,
                        recent_messages,
                        topic_id=args.topic_id if args.topic else None,
                        media_dir=media_dir
                    )
                    message_count += 1
                    print(f"Successfully sent message {message_count}")
                except Exception as e:
                    print(f"Error processing message: {str(e)}")
                    # 如果是认证错误，从活动客户端列表中移除
                    if "auth" in str(e).lower():
                        print(f"Removing client {client.session.filename} due to auth error")
                        active_clients.remove(client)
                        if not active_clients:
                            print("Error: No active clients remaining")
                            return
                    continue
                
                # 等待随机时间间隔
                interval = random.uniform(args.min_interval, args.max_interval)
                print(f"Waiting {interval:.1f} seconds before next message...")
                await asyncio.sleep(interval)
                
            except Exception as e:
                print(f"Error in message loop: {str(e)}")
                continue
        
        print(f"\nChat loop completed. Sent {message_count} messages successfully.")
        
    except Exception as e:
        print(f"Fatal error in chat loop: {str(e)}")
        import traceback
        traceback.print_exc()

async def main():
    try:
        # Parse command line arguments
        args = parse_args()
        
        print("\n=== Starting Auto Chat ===")
        print(f"Target group: {args.target_group}")
        print(f"Is topic group: {args.topic}")
        print(f"Topic ID: {args.topic_id}")
        print(f"Message interval: {args.min_interval}-{args.max_interval}")
        print(f"Message source: {args.message_source}")
        print(f"Root directory: {args.root_dir}")
        print(f"User email: {args.user_email}")
        
        # 检查消息源文件
        message_source_path = os.path.join(
            args.root_dir,
            'scraped_data',
            args.user_email,
            args.message_source,
            f"{args.message_source}_messages.csv"
        )
        print(f"\nChecking message source file: {message_source_path}")
        
        if not os.path.exists(message_source_path):
            print(f"Error: Message source file not found: {message_source_path}")
            sys.exit(1)
            
        try:
            df = pd.read_csv(message_source_path)
            print(f"Successfully loaded message source file. Found {len(df)} messages.")
        except Exception as e:
            print(f"Error reading message source file: {str(e)}")
            sys.exit(1)
        
        # 检查会话目录
        session_dir = os.path.join(args.root_dir, SESSIONS_DIR, args.user_email)
        print(f"\nChecking session directory: {session_dir}")
        
        if not os.path.exists(session_dir):
            print(f"Creating session directory: {session_dir}")
            os.makedirs(session_dir, exist_ok=True)
        
        # 检查媒体目录
        media_dir = os.path.join(
            args.root_dir,
            'scraped_data',
            args.user_email,
            args.message_source,
            'media'
        )
        print(f"\nChecking media directory: {media_dir}")
        
        if not os.path.exists(media_dir):
            print(f"Creating media directory: {media_dir}")
            os.makedirs(media_dir, exist_ok=True)
        
        try:
            # 初始化客户端
            print("\nInitializing Telegram clients...")
            clients = await init_clients(args.user_email)
            
            if not clients:
                print("Error: No valid clients found")
                sys.exit(1)
                
            print(f"Successfully initialized {len(clients)} clients")
            
            # 运行主循环
            print("\nStarting chat loop...")
            await run_chat_loop(clients, df, args, media_dir)
            
        except Exception as e:
            print(f"Error in main function: {str(e)}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
            
    except Exception as e:
        print(f"Fatal error in main: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nReceived keyboard interrupt, stopping...")
    except Exception as e:
        print(f"Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()
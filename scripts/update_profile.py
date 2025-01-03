import os
import sys
import json
import logging
import re
from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    UsernameOccupiedError,
    UsernameNotModifiedError,
    UsernameInvalidError
)
from telethon.tl.functions.account import UpdateProfileRequest, UpdateUsernameRequest
from telethon.tl.functions.photos import UploadProfilePhotoRequest
from telethon.tl.types import InputFile
from config import API_ID, API_HASH, DEFAULT_PROXY, get_user_sessions_dir

# 配置日志，使用utf-8编码
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)
logger = logging.getLogger(__name__)

# 设置stdout为utf-8编码
import codecs
sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def validate_username(username: str) -> bool:
    """验证用户名是否符合Telegram的要求"""
    if not username:
        return True
    # 移除@符号（如果有）
    username = username.lstrip('@')
    # Telegram用户名规则：
    # 1. 以字母开头
    # 2. 以字母或数字结尾
    # 3. 中间可以包含字母、数字、下划线
    # 4. 长度在5-32之间
    username_regex = re.compile(r'^[a-zA-Z][\w\d]{3,30}[a-zA-Z\d]$')
    return bool(username_regex.match(username))

async def update_profile(user_email: str, session_name: str, first_name: str = None, last_name: str = None, username: str = None, photo_path: str = None):
    try:
        # 获取用户的sessions目录
        sessions_dir = get_user_sessions_dir(user_email)
        logger.info(f"用户sessions目录: {sessions_dir}")

        # 构建session文件路径
        session_file = os.path.join(sessions_dir, f"{session_name}.session")
        if not os.path.exists(session_file):
            logger.error(f"Session文件不存在: {session_file}")
            return {
                'success': False,
                'error': 'Session file not found'
            }

        logger.info(f"正在处理session: {session_name}")

        # 创建客户端实例，使用代理
        client = TelegramClient(
            session_file,
            API_ID,
            API_HASH,
            proxy=DEFAULT_PROXY
        )
        
        try:
            await client.connect()
            
            if not await client.is_user_authorized():
                logger.warning(f"Session未授权: {session_name}")
                return {
                    'success': False,
                    'error': 'Session is not authorized'
                }

            logger.info(f"Session验证成功: {session_name}")

            # 更新个人资料
            try:
                if first_name is not None or last_name is not None:
                    logger.info(f"正在更新名字信息: {session_name}")
                    await client(UpdateProfileRequest(
                        first_name=first_name if first_name is not None else '',
                        last_name=last_name if last_name is not None else ''
                    ))
                    logger.info(f"名字信息更新成功: {session_name}")

                if username is not None:
                    # 验证用户名格式
                    if not validate_username(username):
                        return {
                            'success': False,
                            'error': 'Invalid username format. Username must:\n- Start with a letter\n- End with a letter or number\n- Be 5-32 characters long\n- Only contain letters, numbers, and underscores'
                        }

                    # 去掉用户名中的@符号（如果有）
                    username = username.lstrip('@')
                    
                    # 获取当前用户信息
                    current_user = await client.get_me()
                    current_username = current_user.username
                    
                    # 检查用户名是否相同
                    if current_username and current_username.lower() == username.lower():
                        logger.info(f"用户名未变化，跳过更新: {username}")
                    else:
                        try:
                            logger.info(f"正在更新用户名为 {username}: {session_name}")
                            await client(UpdateUsernameRequest(username))
                            logger.info(f"用户名更新成功: {session_name}")
                        except UsernameOccupiedError:
                            logger.error(f"用户名 {username} 已被占用")
                            return {
                                'success': False,
                                'error': f'The username "{username}" is already taken. Please choose a different username.'
                            }
                        except UsernameInvalidError:
                            logger.error(f"用户名 {username} 格式无效")
                            return {
                                'success': False,
                                'error': f'The username "{username}" is invalid. Username must:\n- Start with a letter\n- End with a letter or number\n- Be 5-32 characters long\n- Only contain letters, numbers, and underscores'
                            }
                        except UsernameNotModifiedError:
                            logger.info(f"用户名未变化，跳过更新: {username}")
                        except Exception as e:
                            logger.error(f"更新用户名时出错: {str(e)}")
                            return {
                                'success': False,
                                'error': f'Failed to update username: {str(e)}'
                            }

                if photo_path and os.path.exists(photo_path):
                    # 标准化路径
                    photo_path = os.path.normpath(photo_path)
                    logger.info(f"正在上传头像，文件路径: {photo_path}")
                    
                    # 读取文件并上传
                    try:
                        # 使用二进制模式打开文件
                        with open(photo_path, 'rb') as f:
                            # 直接将文件对象传递给upload_file
                            file = await client.upload_file(f)
                            logger.info("文件上传成功，正在设置为头像")
                            
                            # 设置为头像，使用关键字参数
                            await client(UploadProfilePhotoRequest(
                                file=file
                            ))
                            logger.info(f"头像更新成功: {session_name}")
                    except Exception as e:
                        logger.error(f"上传头像失败: {str(e)}")
                        return {
                            'success': False,
                            'error': f'Failed to upload profile photo: {str(e)}'
                        }

                # 获取更新后的信息
                logger.info(f"正在获取更新后的账号信息: {session_name}")
                me = await client.get_me()
                
                result = {
                    'success': True,
                    'session': session_name,
                    'user': {
                        'first_name': me.first_name,
                        'last_name': me.last_name,
                        'username': me.username,
                        'phone': me.phone,
                        'id': me.id
                    }
                }
                logger.info(f"账号信息更新成功: {session_name}")
                return result

            except FloodWaitError as e:
                logger.error(f"请求过于频繁，需要等待 {e.seconds} 秒: {session_name}")
                return {
                    'success': False,
                    'error': f'Too many requests. Please wait {e.seconds} seconds'
                }
            except Exception as e:
                logger.error(f"更新过程中出错: {session_name} - {str(e)}")
                return {
                    'success': False,
                    'error': str(e)
                }

        except Exception as e:
            logger.error(f"处理session时出错: {session_name} - {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            await client.disconnect()
            logger.info(f"已断开与Telegram的连接: {session_name}")

    except Exception as e:
        logger.error(f"发生未预期的错误: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    import asyncio
    
    # 从命令行参数获取信息
    if len(sys.argv) != 3:
        logger.error('Usage: python update_profile.py <user_email> <json_config>')
        sys.exit(1)

    user_email = sys.argv[1]
    try:
        config = json.loads(sys.argv[2])
        logger.info(f"收到更新请求: {json.dumps(config, ensure_ascii=False)}")
        
        if 'session_name' not in config:
            logger.error("缺少session_name参数")
            print(json.dumps({
                'success': False,
                'error': 'Session name is required'
            }, ensure_ascii=False).encode('utf-8').decode())
            sys.exit(1)

        result = asyncio.run(update_profile(
            user_email=user_email,
            session_name=config['session_name'],
            first_name=config.get('first_name'),
            last_name=config.get('last_name'),
            username=config.get('username'),
            photo_path=config.get('photo_path')
        ))
        
        # 使用 UTF-8 编码输出 JSON
        print(json.dumps(result, ensure_ascii=False).encode('utf-8').decode())
    except json.JSONDecodeError as e:
        logger.error(f"JSON解析错误: {str(e)}")
        print(json.dumps({
            'success': False,
            'error': 'Invalid JSON configuration'
        }, ensure_ascii=False).encode('utf-8').decode())
        sys.exit(1)

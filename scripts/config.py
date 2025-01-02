"""
Configuration file for Telegram bot scripts
"""
import os

# Telegram API credentials
API_ID = 22453265
API_HASH = "641c3fad1c94728381a70113c70cd52d"

# Constants
BASE_SESSIONS_DIR = 'D:/tg-bot-web/sessions'  # 使用正斜杠和完整路径
MEDIA_DIR = 'D:/tg-bot-web/scraped_data'      # 使用正斜杠和完整路径

def get_user_sessions_dir(user_email):
    """获取用户特定的sessions目录"""
    sessions_dir = os.path.join(BASE_SESSIONS_DIR, user_email)
    # 确保目录存在
    os.makedirs(sessions_dir, exist_ok=True)
    return sessions_dir

# Emoji list for reactions
REACTION_EMOJIS = ['👍', '🔥', '🎉', '💯']

# Proxy configurations
PROXY_CONFIGS = [
    {
        'proxy_type': 'socks5',
        'addr': '119.42.39.170',
        'port': 5798,
        'username': 'Maomaomao77',
        'password': 'Maomaomao77',
        'rdns': True
    }
]

# Default proxy configuration (used by session_gen.py)
DEFAULT_PROXY = PROXY_CONFIGS[0]

"""
Configuration file for Telegram bot scripts
"""

# Telegram API credentials
API_ID = 22453265
API_HASH = "641c3fad1c94728381a70113c70cd52d"

# Constants
SESSIONS_DIR = "sessions"
MEDIA_DIR = "scraped_data"

# Emoji list for reactions
REACTION_EMOJIS = ['👍', '🔥', '🎉', '💯']

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
        'addr': "103.48.80.113",
        'port': 6235,
        'username': 'Maomaomao77',
        'password': 'Maomaomao77'
    }
]

# Default proxy configuration (used by session_gen.py)
DEFAULT_PROXY = PROXY_CONFIGS[0]

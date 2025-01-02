import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
import os
import asyncio
import argparse
from telethon.errors import FloodWaitError, TimeoutError, PasswordHashInvalidError
from config import (
    API_ID,
    API_HASH,
    get_user_sessions_dir,
    DEFAULT_PROXY
)

async def try_connect(phone, user_email, max_attempts=3):
    """Try to connect with retry mechanism"""
    # 获取用户特定的session目录
    sessions_dir = get_user_sessions_dir(user_email)
    os.makedirs(sessions_dir, exist_ok=True)
    
    session_file = os.path.join(sessions_dir, f"{phone}.session")
    
    for attempt in range(max_attempts):
        try:
            print(f"\nAttempt {attempt + 1} of {max_attempts}...")
            client = TelegramClient(
                session_file,
                API_ID,
                API_HASH,
                proxy=DEFAULT_PROXY
            )
            
            await client.connect()
            
            if not await client.is_user_authorized():
                print(f"\nSending verification code to {phone}...")
                await client.send_code_request(phone)
                code = input(f"Enter the verification code sent to {phone}: ")
                try:
                    await client.sign_in(phone, code)
                except Exception as e:
                    if "Two-steps verification" in str(e):
                        print("\n[INFO] Two-factor authentication is enabled")
                        password = input("Please enter your 2FA password: ")
                        await client.sign_in(password=password)
                    else:
                        raise e
            
            if await client.is_user_authorized():
                print(f"[SUCCESS] Session file created: {session_file}")
                me = await client.get_me()
                print(f"[SUCCESS] Logged in as: {me.first_name} (@{me.username})")
                await client.disconnect()
                return True
                
        except FloodWaitError as e:
            print(f"\n[ERROR] Hit flood wait error. Need to wait {e.seconds} seconds")
            if attempt < max_attempts - 1:
                print(f"Waiting {e.seconds} seconds before next attempt...")
                await asyncio.sleep(e.seconds)
            else:
                raise e
                
        except TimeoutError:
            print("\n[ERROR] Request timed out")
            if attempt < max_attempts - 1:
                print("Retrying...")
                await asyncio.sleep(1)
            else:
                raise TimeoutError("Max retry attempts reached")
                
        except Exception as e:
            print(f"\n[ERROR] Failed to connect: {str(e)}")
            if attempt < max_attempts - 1:
                print("Retrying...")
                await asyncio.sleep(1)
            else:
                raise e
                
        finally:
            try:
                await client.disconnect()
            except:
                pass
                
    return False

async def main():
    parser = argparse.ArgumentParser(description='Generate Telegram session file')
    parser.add_argument('phone', help='Phone number with country code')
    parser.add_argument('--output-dir', help='Output directory for session file')
    parser.add_argument('--user-email', help='User email for session directory', required=True)
    args = parser.parse_args()
    
    try:
        success = await try_connect(args.phone, args.user_email)
        if not success:
            print("\n[ERROR] Failed to create session after all attempts")
            sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())

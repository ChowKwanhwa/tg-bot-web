import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
import os
import asyncio
from telethon.errors import FloodWaitError, TimeoutError, PasswordHashInvalidError
from config import (
    API_ID,
    API_HASH,
    SESSIONS_DIR,
    DEFAULT_PROXY
)

async def try_connect(phone, sessions_dir, max_attempts=3):
    """Try to connect with retry mechanism"""
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
            print(f"[ERROR] Too many requests, wait for {e.seconds} seconds")
            await client.disconnect()
            return False
            
        except TimeoutError:
            print(f"[ERROR] Connection timeout (attempt {attempt + 1}/{max_attempts})")
            try:
                await client.disconnect()
            except:
                pass
            
            if attempt < max_attempts - 1:
                # Wait for a while before retrying
                await asyncio.sleep(5)
                continue
            else:
                print("[ERROR] Max retry attempts reached")
                return False
            
        except PasswordHashInvalidError:
            print("[ERROR] Invalid 2FA password")
            try:
                await client.disconnect()
            except:
                pass
            return False
            
        except Exception as e:
            print(f"[ERROR] Connection error: {str(e)}")
            try:
                await client.disconnect()
            except:
                pass
            return False
    
    return False

async def main():
    # Get phone number from command line argument
    if len(sys.argv) < 2:
        print("Please provide phone number as command line argument")
        sys.exit(1)

    phone = sys.argv[1]
    print(f"\nProcessing phone number: {phone}")
    
    # Create sessions directory if it doesn't exist
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    
    # Try to connect
    success = await try_connect(phone, SESSIONS_DIR)
    if not success:
        print(f"\n[FAILED] Session generation failed for {phone}!")
        sys.exit(1)
    
    sys.exit(0)

if __name__ == '__main__':
    asyncio.run(main())

@echo off
:start
echo Starting services...

:: Kill existing processes
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

:: Start Next.js
start "Next.js" cmd /c "npm run dev"

:: Wait for Next.js to start
timeout /t 10 /nobreak

:: Start ngrok
start "ngrok" cmd /c "ngrok http 3000"

:: Keep the script running and check connection every 5 minutes
:loop
timeout /t 300 /nobreak
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    echo Connection lost, restarting services...
    goto start
)
goto loop

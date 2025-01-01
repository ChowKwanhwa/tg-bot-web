@echo off
:: Change to the script's directory
cd /d "%~dp0"
echo Starting services from %CD%...

:: Kill existing processes
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

:: Build the Next.js application
call npm run build

:: Start PM2 with our ecosystem config
call pm2 delete all >nul 2>&1
call pm2 start ecosystem.config.js

:: Create startup script
call pm2 save
call pm2 startup

:: Keep the script running and monitor services
:loop
echo Checking services status...
timeout /t 300 /nobreak >nul

:: Check if services are running
call pm2 list | findstr "errored stopped" >nul
if not errorlevel 1 (
    echo Service error detected, restarting...
    call pm2 restart all
)

:: Check if ngrok is accessible
curl -s http://localhost:4040 >nul
if errorlevel 1 (
    echo Ngrok not responding, restarting...
    call pm2 restart ngrok
)

goto loop

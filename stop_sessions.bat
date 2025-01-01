@echo off
echo Stopping all Python and Node.js processes...

:: Kill Python processes
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM pythonw.exe >nul 2>&1

:: Kill Node.js processes
taskkill /F /IM node.exe >nul 2>&1

:: Kill ngrok
taskkill /F /IM ngrok.exe >nul 2>&1

:: Clean up PM2
call pm2 delete all >nul 2>&1

:: Remove session files
del /F /Q "%~dp0\*.session" >nul 2>&1
del /F /Q "%~dp0\*.session-journal" >nul 2>&1

echo All processes have been stopped and sessions cleaned up.

@echo off
schtasks /create /tn "Start Web Services" /tr "\"%~dp0start-services.bat\"" /sc onstart /ru System /f
echo Task created successfully!

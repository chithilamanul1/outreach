@echo off
cd /d "%~dp0"
echo ========================================================
echo Stopping Ocean Way Tours Rate Hunter background process...
echo ========================================================

:: Find and kill process running on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Stopping process PID: %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Process stopped successfully.
timeout /t 3 >nul

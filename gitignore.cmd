@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found!
    echo Please download and install Node.js LTS from: https://nodejs.org/
    pause
    exit /b 1
)
node scripts\gitignore.js %*
if %errorlevel% neq 0 pause
endlocal

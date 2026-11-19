@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required but not installed or not in PATH.
    echo Please download and install Node.js LTS: https://nodejs.org/
    pause
    exit /b 1
)

chcp 65001 >nul
node scripts\sync.js %*
if %errorlevel% neq 0 pause
endlocal

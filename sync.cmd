@echo off
chcp 65001 >nul
setlocal
title 好選保健 PurePick - 團隊進度同步與機密安全中心 (sync.cmd)
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [錯誤] 系統找不到 Node.js！
    echo 請先下載並安裝 Node.js LTS 版本: https://nodejs.org/
    pause
    exit /b 1
)
node scripts\sync.js %*
if %errorlevel% neq 0 pause
endlocal

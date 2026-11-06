@echo off
setlocal
cd /d "%~dp0"
node scripts\sync.js %*
if %errorlevel% neq 0 pause
endlocal

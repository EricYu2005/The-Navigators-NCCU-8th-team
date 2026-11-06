@echo off
chcp 65001 >nul
title CareNav 團隊進度同步與機密安全中心 (sync.cmd)

:MENU
cls
echo ================================================================
echo       🔄 CareNav 團隊進度同步與機密安全管理中心 (sync.cmd)
echo ================================================================
echo.

:: 1. 檢查 Git 與 Node.js
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 錯誤：尚未安裝 Git！請先安裝 Git：https://git-scm.com/
    pause
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 錯誤：尚未偵測到 Node.js！請安裝 Node.js LTS：https://nodejs.org/
    pause
    exit /b 1
)

:: 取得目前分支
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%i
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main

:: 顯示機密狀態摘要
node scripts/secrets.js status

echo 目前 Git 分支：[%CURRENT_BRANCH%]
echo.
echo ======================== 功能選單 ==============================
echo   [1] 🚀 一鍵全自動同步 (先拉取組員進度 + 自動更新套件 + 推送我的成果)
echo   [2] 📥 僅拉取最新代碼 (Pull：取得組員最新進度與自動套件檢查)
echo   [3] 📤 僅推送我的進度 (Push：將本地完成的頁面與代碼提交至 GitHub)
echo   [4] 🔐 機密資訊安全管理中心 (.env 編輯 / 加密匯出 / 解密同步)
echo   [5] 🛠️ Git 衝突急救與狀態診斷 (修復卡住或中斷的同步)
echo   [0] 離開
echo ================================================================
set /p choice="請輸入選項號碼 (1-5, 0): "

if "%choice%"=="1" goto AUTO_SYNC
if "%choice%"=="2" goto PULL_ONLY
if "%choice%"=="3" goto PUSH_ONLY
if "%choice%"=="4" goto SECRETS_CENTER
if "%choice%"=="5" goto GIT_DOCTOR
if "%choice%"=="0" exit /b 0

echo ⚠️ 輸入錯誤，請重新選擇。
timeout /t 2 >nul
goto MENU

:: ================================================================
:: [1] 一鍵全自動同步 (Auto Sync)
:: ================================================================
:AUTO_SYNC
echo.
echo ================================================================
echo 🚀 [步驟 1/3] 正在從 GitHub 拉取組員的最新成果...
echo ================================================================
git pull origin %CURRENT_BRANCH%
if %errorlevel% neq 0 (
    echo.
    echo ⚠️ 拉取時遇到版本衝突，建議先選擇 [5] 衝突急救或手動確認衝突檔案。
    pause
    goto MENU
)

echo.
echo 📦 [步驟 2/3] 檢查專案套件是否需要更新...
if not exist "node_modules\" (
    echo 偵測到尚未安裝套件，正在為您安裝...
    call npm install
)

echo.
echo 📤 [步驟 3/3] 檢查本地是否有新修改需要推送...
git status -s
echo.
set /p commit_msg="請輸入本次修改說明 (若沒有修改或直接按 Enter 將跳過推送): "

if "%commit_msg%"=="" (
    echo 沒有需要提交的新說明，同步完成！
) else (
    :: 強制安全隔離機密
    git add .
    git reset HEAD .env 2>nul
    git reset HEAD secrets.vault 2>nul
    git reset HEAD data.db 2>nul
    git reset HEAD gcp-key.json 2>nul
    
    git commit -m "%commit_msg%"
    echo.
    echo 正在推送至 GitHub (%CURRENT_BRANCH%)...
    git push origin %CURRENT_BRANCH%
    if %errorlevel% equ 0 (
        echo.
        echo 🎉 恭喜！一鍵全自動同步圓滿成功！
    ) else (
        echo.
        echo ⚠️ 推送失敗，請確認網路連線或權限。
    )
)
echo.
pause
goto MENU

:: ================================================================
:: [2] 僅拉取最新代碼 (Pull Only)
:: ================================================================
:PULL_ONLY
echo.
echo 📥 正在從 GitHub 拉取最新進度...
git pull origin %CURRENT_BRANCH%
if %errorlevel% equ 0 (
    echo.
    echo ✅ 最新代碼已成功更新！
    echo 檢查是否需要同步套件...
    call npm install
) else (
    echo.
    echo ⚠️ 拉取失敗，請確認網路或衝突狀態。
)
echo.
pause
goto MENU

:: ================================================================
:: [3] 僅推送我的進度 (Push Only)
:: ================================================================
:PUSH_ONLY
echo.
echo 🔍 正在檢查本地變更檔案...
git status -s
echo.
set /p commit_msg="請輸入本次修改說明 (例: 美化指引卡樣式): "
if "%commit_msg%"=="" set commit_msg=chore: 更新專案進度

:: 嚴格防護機密
git add .
git reset HEAD .env 2>nul
git reset HEAD secrets.vault 2>nul
git reset HEAD data.db 2>nul
git reset HEAD gcp-key.json 2>nul

git commit -m "%commit_msg%"
echo.
echo 📤 正在推送至 GitHub (%CURRENT_BRANCH%)...
git push origin %CURRENT_BRANCH%
if %errorlevel% equ 0 (
    echo.
    echo 🎉 您的代碼已成功推送到 GitHub，組員可以同步看見了！
) else (
    echo.
    echo ⚠️ 推送失敗。若是遠端有新代碼，請先選擇 [2] 拉取最新進度後再推。
)
echo.
pause
goto MENU

:: ================================================================
:: [4] 機密資訊安全管理中心 (Secrets Center)
:: ================================================================
:SECRETS_CENTER
cls
echo ================================================================
echo       🔐 機密資訊管理中心 (儲存、同步與加密保護)
echo ================================================================
echo.
echo 什麼是機密資訊？
echo • 本地的 .env 檔案（包含 Ollama 設定、API Key、資料庫密碼等）
echo • 這些資訊「絕對不能」直接推送到 GitHub 公開！
echo • 透過本工具，您可以將機密安全加密，生成密文在 LINE/Discord 分享！
echo.
echo 請選擇機密操作：
echo   [1] 📝 編輯本機 .env 設定檔 (使用記事本開啟)
echo   [2] 🔒 匯出加密機密包 (設定密碼，產生團隊分享密文字串)
echo   [3] 🔓 匯入團隊機密包 (貼上密文並輸入密碼，一秒同步 .env)
echo   [4] 📋 自動更新 .env.example 公開範本 (遮蔽數值後供 GitHub 參考)
echo   [0] 返回主選單
echo ================================================================
set /p sec_choice="請輸入選項 (1-4, 0): "

if "%sec_choice%"=="1" (
    node scripts/secrets.js edit
    goto SECRETS_CENTER
)
if "%sec_choice%"=="2" (
    echo.
    set /p sec_pwd="請設定團隊通關密碼 (需告訴組員以利解密): "
    if not "%sec_pwd%"=="" (
        node scripts/secrets.js export "%sec_pwd%"
    ) else (
        echo ❌ 密碼不能為空！
    )
    pause
    goto SECRETS_CENTER
)
if "%sec_choice%"=="3" (
    echo.
    set /p sec_pwd="請輸入團隊通關密碼: "
    set /p sec_cipher="請貼上組員傳來的加密字串 (若留空則從 secrets.vault 載入): "
    if not "%sec_pwd%"=="" (
        node scripts/secrets.js import "%sec_pwd%" "%sec_cipher%"
    ) else (
        echo ❌ 密碼不能為空！
    )
    pause
    goto SECRETS_CENTER
)
if "%sec_choice%"=="4" (
    node scripts/secrets.js update-example
    pause
    goto SECRETS_CENTER
)
if "%sec_choice%"=="0" goto MENU

goto SECRETS_CENTER

:: ================================================================
:: [5] Git 衝突急救與狀態診斷
:: ================================================================
:GIT_DOCTOR
echo.
echo ================================================================
echo 🛠️ Git 狀態診斷報告：
echo ================================================================
git status
echo.
echo 急救選項：
echo   [1] 取消目前的 Merge / Rebase 衝突 (恢復到安全狀態)
echo   [2] 強制刪除卡住的 Git Lock 檔案 (.git/index.lock)
echo   [0] 返回主選單
set /p doc_choice="請選擇 (1, 2, 0): "

if "%doc_choice%"=="1" (
    git merge --abort 2>nul
    git rebase --abort 2>nul
    echo ✅ 已取消衝突狀態，回到乾淨工作區。
    pause
    goto MENU
)
if "%doc_choice%"=="2" (
    del /f /q .git\index.lock 2>nul
    echo ✅ 已清除 index.lock 鎖定檔。
    pause
    goto MENU
)
goto MENU

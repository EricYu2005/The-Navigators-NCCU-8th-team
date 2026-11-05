@echo off
chcp 65001 >nul
title 創創入門專案 - 團隊同步與機密安全中心 (sync.cmd)

echo ====================================================
echo      🔄 團隊同步與機密安全管理工具 (sync.cmd)
echo ====================================================
echo.

:: 1. 檢查 Git 環境
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 錯誤：尚未安裝 Git！請先安裝 Git 後再執行同步。
    echo 官方下載：https://git-scm.com/
    pause
    exit /b 1
)

:: 2. 機密檔案保護檢查（儲存機密資訊守門員）
echo 🔒 [機密安全檢查] 正在驗證機密資訊隔離機制...
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo   ➜ 已自動從 .env.example 建立本機 .env 檔案。
    )
)

:: 確保 .gitignore 存在且包含 .env
findstr /i /c:".env" .gitignore >nul 2>nul
if %errorlevel% neq 0 (
    echo .env >> .gitignore
    echo   ➜ 已自動將 .env 加入 .gitignore，防止機密洩漏！
)

:: 強制自 Git 暫存區移除非法追蹤的機密與資料庫檔（不刪除本機實體檔案）
git rm -r --cached .env 2>nul
git rm -r --cached data.db 2>nul
git rm -r --cached node_modules 2>nul

echo   ✅ 機密隔離完成！.env 檔案僅留存於本機，不會上傳至 GitHub。
echo.

:: 3. 顯示目前分支狀態
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set CURRENT_BRANCH=%%i
if "%CURRENT_BRANCH%"=="" set CURRENT_BRANCH=main

echo ====================================================
echo 目前所在分支：[%CURRENT_BRANCH%]
echo.
echo 請選擇要執行的同步動作：
echo   [1] 📥 拉取最新代碼 (Pull：取得組員的最新成果)
echo   [2] 📤 推送我的進度 (Push：將我完成的功能上傳至 GitHub)
echo   [3] 🔄 完整一鍵雙向同步 (先拉取最新成果，再提交並推送我的進度)
echo   [4] 🔑 機密資訊設定說明 (.env 使用方式)
echo   [0] 離開
echo ====================================================
set /p choice="請輸入選項號碼 (1-4, 0): "

if "%choice%"=="1" goto PULL_CODE
if "%choice%"=="2" goto PUSH_CODE
if "%choice%"=="3" goto FULL_SYNC
if "%choice%"=="4" goto SECRET_GUIDE
if "%choice%"=="0" exit /b 0

echo 輸入錯誤，請重新執行。
pause
exit /b 1

:PULL_CODE
echo.
echo 📥 正在從 GitHub 拉取最新程式碼...
git pull origin %CURRENT_BRANCH%
if %errorlevel% equ 0 (
    echo.
    echo ✅ 同步完成！您已取得團隊最新進度。
) else (
    echo.
    echo ⚠️ 拉取時發生問題，可能是遠端尚未建立該分支或有版本衝突。
)
goto END

:PUSH_CODE
echo.
echo 🔍 正在檢查本地程式碼變更...
git status -s
echo.
set /p commit_msg="請輸入本次修改的簡短說明 (例: 修改首頁按鈕顏色): "
if "%commit_msg%"=="" set commit_msg=chore: 更新專案進度

:: 再次確保機密不會被加進去
git add .
git reset HEAD .env 2>nul
git reset HEAD data.db 2>nul

git commit -m "%commit_msg%"
echo.
echo 📤 正在推送至 GitHub (%CURRENT_BRANCH%)...
git push origin %CURRENT_BRANCH%
if %errorlevel% equ 0 (
    echo.
    echo 🎉 恭喜！您的進度已成功推送到 GitHub，組員可以同步看見了！
) else (
    echo.
    echo ⚠️ 推送失敗，若提示需要先 pull，請先選擇 [1] 拉取最新代碼後再推。
)
goto END

:FULL_SYNC
echo.
echo 🔄 [步驟 1/2] 正在拉取遠端最新代碼...
git pull origin %CURRENT_BRANCH%
echo.
echo 🔄 [步驟 2/2] 準備提交本地進度...
git status -s
set /p commit_msg="請輸入本次修改的簡短說明 (直接按 Enter 將使用預設說明): "
if "%commit_msg%"=="" set commit_msg=feat: 同步組員功能更新

git add .
git reset HEAD .env 2>nul
git reset HEAD data.db 2>nul
git commit -m "%commit_msg%"
git push origin %CURRENT_BRANCH%
if %errorlevel% equ 0 (
    echo.
    echo 🎉 雙向同步圓滿完成！
) else (
    echo.
    echo ⚠️ 同步過程遇到問題，請檢查網路或衝突狀態。
)
goto END

:SECRET_GUIDE
echo.
echo ====================================================
echo 🔑 機密資訊與金鑰安全管理說明：
echo.
echo 1. 什麼是機密資訊？
echo    - 資料庫密碼、第三方 API Key、JWT 密鑰等，嚴禁上傳到 GitHub！
echo 2. 怎麼安全儲存？
echo    - 請統一填寫在本地的「.env」檔案中（程式會自動讀取）。
echo 3. 組員之間如何共享機密？
echo    - 「.env.example」只存放變數名稱範本（無真正密碼），隨 Git 同步。
echo    - 真實的密鑰與密碼，請組員私下透過 LINE / Discord / 通訊群組安全分享，
echo      每個人再各自複製填入自己電腦中的「.env」檔案！
echo ====================================================
goto END

:END
echo.
pause

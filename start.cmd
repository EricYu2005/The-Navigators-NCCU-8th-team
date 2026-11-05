@echo off
chcp 65001 >nul
title 創創入門專案 - 一鍵啟動精靈 (start.cmd)

echo ====================================================
echo       🚀 創創入門專案 - 一鍵啟動精靈 (start.cmd)
echo ====================================================
echo.

:: 1. 檢查是否已安裝 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 錯誤：您的電腦尚未安裝 Node.js！
    echo.
    echo 請依下列步驟安裝：
    echo 1. 前往官方網站：https://nodejs.org/
    echo 2. 下載並安裝「LTS 版本」（長期支援版）
    echo 3. 安裝完成後，請重新雙擊此 start.cmd
    echo.
    echo ====================================================
    pause
    exit /b 1
)

:: 2. 檢查本地環境設定檔 .env，若無則從 .env.example 複製
if not exist ".env" (
    if exist ".env.example" (
        echo ⚙️ 偵測到尚未建立本地設定檔，正在自動從 .env.example 生成 .env ...
        copy .env.example .env >nul
        echo ✅ 已生成 .env（此檔案為本機專用，內含機密資訊，不會被上傳到 GitHub）
        echo.
    )
)

:: 3. 檢查套件是否已安裝 (node_modules)
if not exist "node_modules\" (
    echo 📦 偵測到尚未安裝專案相依套件，正在為您自動執行 npm install ...
    echo （首次安裝約需 1 分鐘，請稍候...）
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ❌ 套件安裝失敗，請檢查網路連線或權限設定。
        pause
        exit /b 1
    )
    echo.
    echo ✅ 相依套件安裝完成！
    echo.
)

:: 4. 背景延遲 2 秒後自動在預設瀏覽器打開網頁
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 5. 啟動後端伺服器與資料庫
echo 🌐 正在啟動後端伺服器與 SQLite 資料庫...
echo 💡 瀏覽器將自動開啟 http://localhost:3000
echo.
echo 【提示】若要停止伺服器，請直接關閉此黑色視窗，或按下鍵盤 Ctrl + C。
echo ====================================================
echo.
call npm start

pause

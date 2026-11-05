@echo off
chcp 65001 >nul
title 創創入門專案 - Git 忽略規則與機密防護設定 (gitignore.cmd)

echo ====================================================
echo   🛡️ Git 忽略規則與安全防護檢查工具 (gitignore.cmd)
echo ====================================================
echo.

:: 1. 確保 .gitignore 檔案存在且包含必備排除項目
echo [1/3] 正在檢查並更新 .gitignore 規則...

(
echo # 相依套件庫（每個人 clone 後透過 npm install 安裝，絕對不進版本庫）
echo node_modules/
echo.
echo # 本地機密環境變數設定檔（禁止推送到 GitHub）
echo .env
echo .env.local
echo .env.*.local
echo.
echo # 本地 SQLite 資料庫檔案（避免組員互相覆蓋各自的測試資料）
echo *.db
echo *.sqlite
echo *.sqlite3
echo data.db
echo.
echo # 編輯器與作業系統快取
echo .DS_Store
echo Thumbs.db
echo .vscode/
echo .idea/
echo.
echo # 執行紀錄與日誌
echo *.log
echo npm-debug.log*
) > .gitignore

echo ✅ .gitignore 規則已成功更新！
echo.

:: 2. 檢查 Git 是否正在追蹤敏感檔案，若有誤追蹤則自動清除快取（不影響本地檔案）
echo [2/3] 檢查是否曾有機密檔或 node_modules 誤進 Git 快取...
where git >nul 2>nul
if %errorlevel% equ 0 (
    git rm -r --cached .env 2>nul
    git rm -r --cached node_modules 2>nul
    git rm -r --cached *.db 2>nul
    git rm -r --cached data.db 2>nul
    echo ✅ 已確保機密資訊 (.env) 與套件庫未被 Git 快取追蹤！
) else (
    echo ⚠️ 尚未偵測到 Git 指令，請確認已安裝 Git。
)
echo.

:: 3. 確保 .env.example 存在（作為組員共享的無機密設定範本）
echo [3/3] 檢查 .env.example 範本檔...
if not exist ".env.example" (
    (
    echo # 伺服器執行的連接埠
    echo PORT=3000
    echo.
    echo # 環境模式：development 或 production
    echo NODE_ENV=development
    echo.
    echo # 若未來串接第三方服務金鑰，請在此註明變數名稱（不要填寫真實密鑰）：
    echo # API_KEY=your_api_key_here
    ) > .env.example
    echo ✅ 已自動生成 .env.example 範本檔。
) else (
    echo ✅ .env.example 範本檔已就緒。
)

echo.
echo ====================================================
echo 🎉 防護檢查完成！所有機密檔案與巨大套件庫均已安全排除。
echo ====================================================
echo.
pause

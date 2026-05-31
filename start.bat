@echo off
cd /d "%~dp0"
echo.
echo  ========================================
echo    漢字ゲーム 起動中...
echo  ========================================
echo.

:: Node サーバーを別ウィンドウで起動
start "漢字ゲーム サーバー" cmd /k "node server.js"

:: 少し待つ
timeout /t 2 /nobreak > nul

:: ngrok でインターネット公開
echo  友達に送るURLを取得しています...
echo.
ngrok http 3000

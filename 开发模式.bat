@echo off
setlocal

cd /d "%~dp0"

echo Starting Markdown Parser (dev mode)...
echo.

REM 首次运行或缺少依赖时自动安装
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  echo.
)

echo URL: http://localhost:5173
echo Press Ctrl+C in this window to stop the server.
echo.

start "" "http://localhost:5173"
call npm run dev

endlocal

@echo off
setlocal

cd /d "%~dp0"

echo Starting Markdown Parser...
echo.
echo URL: http://localhost:4173
echo Press Ctrl+C in this window to stop the server.
echo.

start "" "http://localhost:4173"
npx -y serve . -l 4173

endlocal

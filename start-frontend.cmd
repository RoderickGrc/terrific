@echo off
setlocal

set "ROOT=%~dp0"

start "QA Frontend" cmd /k "cd /d ""%ROOT%frontend"" && npm run dev"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4567"

endlocal

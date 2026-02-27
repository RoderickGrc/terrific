@echo off
setlocal

set "ROOT=%~dp0"

start "QA Backend" cmd /k "cd /d ""%ROOT%backend"" && npm run dev"

endlocal

@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 or newer is required. See README.md for setup instructions.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Building the local game...
  call npm run build
  if errorlevel 1 (
    echo Build failed. See README.md for installation instructions.
    pause
    exit /b 1
  )
)
node scripts\local-server.mjs --open
if errorlevel 1 (
  pause
  exit /b 1
)
exit /b 0

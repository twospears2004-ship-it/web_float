@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 이상이 필요합니다. README.md의 실행 안내를 확인하세요.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo 로컬 게임을 빌드합니다.
  call npm run build
  if errorlevel 1 (
    echo 빌드에 실패했습니다. README.md의 설치 안내를 확인하세요.
    pause
    exit /b 1
  )
)
node scripts\local-server.mjs --open
if errorlevel 1 pause

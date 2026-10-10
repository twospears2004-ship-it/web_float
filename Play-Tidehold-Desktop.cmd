@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\play-desktop.ps1"
if errorlevel 1 (
  echo Windows 실행판을 열지 못했습니다. README.md의 실행 안내를 확인하세요.
  pause
  exit /b 1
)

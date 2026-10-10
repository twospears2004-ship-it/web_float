@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\play-desktop.ps1" %*
if errorlevel 1 (
  echo Could not open the Windows game. See README.md for setup instructions.
  pause
  exit /b 1
)
exit /b 0

@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "dist\MemeAim.exe" (
    start "" "dist\MemeAim.exe"
) else (
    python main.py
)

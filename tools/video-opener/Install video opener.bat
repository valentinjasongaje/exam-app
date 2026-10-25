@echo off
title Install ECE Video Opener
rem Registers the "ecevideo:" link type for this Windows user only (no admin needed).
rem It runs open-video.ps1 from this folder, which only opens .mp4 files in the review folders.
set "SCRIPT=%~dp0open-video.ps1"
if not exist "%SCRIPT%" (
  echo open-video.ps1 is missing from this folder.
  pause
  exit /b 1
)
reg add "HKCU\Software\Classes\ecevideo" /ve /d "URL:ECE Video Opener" /f >nul
reg add "HKCU\Software\Classes\ecevideo" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\ecevideo\shell\open\command" /ve /d "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%SCRIPT%\" \"%%1\"" /f >nul
if errorlevel 1 (
  echo Something went wrong. Nothing was changed.
  pause
  exit /b 1
)
echo.
echo  Done. The play buttons on the exam app will now open videos from this drive.
echo  The first time, your browser asks to open "ECE Video Opener": tick Always allow, then Open.
echo.
echo  If you move this folder or the drive letter changes, run this file again.
echo.
pause

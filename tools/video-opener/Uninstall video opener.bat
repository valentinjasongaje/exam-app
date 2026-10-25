@echo off
title Uninstall ECE Video Opener
reg delete "HKCU\Software\Classes\ecevideo" /f >nul 2>&1
echo ECE Video Opener removed. The play buttons will stop opening videos.
pause

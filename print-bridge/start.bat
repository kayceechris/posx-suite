@echo off
title POSx Print Bridge
echo.
echo ============================================================
echo  POSx Suite Print Bridge
echo ============================================================
echo.
echo  NOTE: For HTTPS (required for Android printing), place
echo  mkcert.exe in this folder before starting.
echo  Download: github.com/FiloSottile/mkcert/releases
echo  (pick mkcert-vX.X.X-windows-amd64.exe, rename to mkcert.exe)
echo.
echo  Installing dependencies...
pip install pywin32 --quiet 2>nul
echo.
python "%~dp0bridge.py"
pause

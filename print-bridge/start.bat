@echo off
title POSx Print Bridge
echo.
echo ============================================================
echo  POSx Suite Print Bridge v3.0 - Relay Mode
echo ============================================================
echo.
echo  Installing dependencies...
pip install pywin32 websocket-client --quiet 2>nul
echo.
python "%~dp0bridge.py"
pause

@echo off
title POSx Print Bridge
echo Starting POSx Print Bridge...
echo Installing/checking dependencies...
pip install pywin32 --quiet 2>nul
echo.
python "%~dp0bridge.py"
pause

@echo off
title POSx Print Bridge
echo Starting POSx Print Bridge...
echo.

REM ── Trust cert in Windows Root store so Chrome fetch() works ────────────────
if exist "%~dp0cert.pem" (
    powershell -NoProfile -Command "if (!(Get-ChildItem Cert:\LocalMachine\Root | Where-Object {$_.Subject -like '*POSx-Bridge*'})) { exit 1 }" >nul 2>&1
    if errorlevel 1 (
        REM Copy cert to C:\ (no spaces) to avoid path quoting issues
        copy /Y "%~dp0cert.pem" "C:\posx-bridge-cert.pem" >nul 2>&1
        echo   Trusting HTTPS certificate - a UAC prompt will appear, click Yes...
        powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c certutil -addstore Root C:\posx-bridge-cert.pem ^&^& del C:\posx-bridge-cert.pem' -Verb RunAs -Wait"
        echo   [OK] Certificate trusted. IMPORTANT: close ALL Chrome windows and reopen.
        echo.
    ) else (
        echo   [OK] Certificate already trusted.
    )
) else (
    echo   cert.pem not found - will be generated on first run.
)

echo.
python "%~dp0bridge.py"
pause

@echo off
title POSx Print Bridge
echo Starting POSx Print Bridge...
echo.

REM ── Trust the self-signed cert so Chrome fetch() accepts it ─────────────────
if exist "%~dp0cert.pem" (
    echo   Checking Windows certificate trust...
    powershell -NoProfile -Command ^
      "$found = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like '*POSx-Bridge*' }; exit $(if ($found) { 0 } else { 1 })" >nul 2>&1
    if errorlevel 1 (
        echo   Installing certificate -- a UAC prompt will appear, click Yes.
        powershell -NoProfile -Command ^
          "Start-Process powershell -ArgumentList '-NoProfile -Command Import-Certificate -FilePath ''%~dp0cert.pem'' -CertStoreLocation Cert:\LocalMachine\Root' -Verb RunAs -Wait"
        echo   [OK] Certificate trusted. Close and reopen Chrome if it was already open.
        echo.
    ) else (
        echo   [OK] Certificate already trusted.
    )
) else (
    echo   cert.pem not found -- bridge will generate it on first run.
    echo   Restart start.bat after the first run to install the certificate.
)

echo.
python bridge.py
pause

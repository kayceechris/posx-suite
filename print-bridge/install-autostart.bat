@echo off
:: Adds the bridge to Windows startup so it runs automatically on boot
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT=%~dp0start.bat

echo Creating shortcut in Windows Startup folder...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP%\POSx-Print-Bridge.lnk'); $s.TargetPath = '%SCRIPT%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"
echo.
echo Done! The bridge will now start automatically when Windows boots.
echo Shortcut created at: %STARTUP%\POSx-Print-Bridge.lnk
pause

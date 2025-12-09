@echo off
echo ============================================================
echo LabGuard Server Storage Setup
echo ============================================================
echo.
echo This will configure this machine as the LabGuard server.
echo.
echo IMPORTANT: This requires Administrator privileges!
echo.
pause

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& {Start-Process PowerShell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0setup-server-storage.ps1""' -Verb RunAs}"

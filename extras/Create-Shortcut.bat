@echo off
rem Makes a Desktop shortcut to PT Journal. Nothing is installed and nothing else is changed.
rem To remove it later, just delete the shortcut.
setlocal
set "PTEXE=%~dp0PT Journal.exe"
set "PTDIR=%~dp0"
set "PTOUT=%~1"
if not exist "%PTEXE%" (
  echo Could not find "PT Journal.exe" next to this file.
  echo Keep this file in the same folder as the app, then run it again.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $out = $env:PTOUT; if (-not $out) { $out = [Environment]::GetFolderPath('Desktop') }; $s = New-Object -ComObject WScript.Shell; $l = $s.CreateShortcut((Join-Path $out 'PT Journal.lnk')); $l.TargetPath = $env:PTEXE; $l.WorkingDirectory = $env:PTDIR.TrimEnd('\'); $l.IconLocation = $env:PTEXE + ',0'; $l.Description = 'PT Journal'; $l.Save(); Write-Host ('Shortcut created: ' + (Join-Path $out 'PT Journal.lnk'))"
if errorlevel 1 (
  echo Something went wrong. You can also right-click the app and choose Send to, then Desktop, then create shortcut.
  pause
  exit /b 1
)
echo.
echo Done. You can close this window.
pause

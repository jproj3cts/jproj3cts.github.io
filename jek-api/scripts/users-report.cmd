@echo off
rem JEKray accounts report: double-click this file (or a desktop shortcut to it).
rem It fetches everyone with an account, writes them as a page and opens it in your browser.
rem The first time, it asks for the OPS_TOKEN value and keeps it for your Windows account (JEK_OPS_TOKEN).
setlocal
cd /d "%~dp0.."
title JEKray accounts report

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, or not on the PATH. Install it from nodejs.org, then try again.
  pause
  exit /b 1
)

if defined JEK_OPS_TOKEN goto run
:ask
echo.
echo JEKray accounts report: paste the OPS_TOKEN value ^(right-click pastes^), then press Enter.
set "JEK_OPS_TOKEN="
set /p "JEK_OPS_TOKEN=Token: "
if not defined JEK_OPS_TOKEN exit /b 1
setx JEK_OPS_TOKEN "%JEK_OPS_TOKEN%" >nul

:run
set "OUT=%TEMP%\jekray-accounts.html"
echo Fetching everyone with an account...
node scripts\users.mjs --html "%OUT%" >nul
if errorlevel 1 goto failed
start "" "%OUT%"
exit /b 0

:failed
echo.
choice /c RQ /n /m "Press R to enter the token again, or Q to close: "
if errorlevel 2 exit /b 1
goto ask

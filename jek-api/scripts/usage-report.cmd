@echo off
rem JEKray usage report: double-click this file (or a desktop shortcut to it).
rem It fetches the last 30 days of usage counts, writes them as a page and opens it in your browser.
rem The first time, it asks for the OPS_TOKEN value and keeps it for your Windows account (JEK_OPS_TOKEN).
rem Another number of days: run it with one, as  usage-report.cmd 90
setlocal
cd /d "%~dp0.."
title JEKray usage report

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, or not on the PATH. Install it from nodejs.org, then try again.
  pause
  exit /b 1
)

if defined JEK_OPS_TOKEN goto run
:ask
echo.
echo JEKray usage report: paste the OPS_TOKEN value ^(right-click pastes^), then press Enter.
set "JEK_OPS_TOKEN="
set /p "JEK_OPS_TOKEN=Token: "
if not defined JEK_OPS_TOKEN exit /b 1
setx JEK_OPS_TOKEN "%JEK_OPS_TOKEN%" >nul

:run
set "DAYS=%~1"
if not defined DAYS set "DAYS=30"
set "OUT=%TEMP%\jekray-usage.html"
echo Fetching the last %DAYS% days...
node scripts\usage.mjs --days %DAYS% --html "%OUT%" >nul
if errorlevel 1 goto failed
start "" "%OUT%"
exit /b 0

:failed
echo.
choice /c RQ /n /m "Press R to enter the token again, or Q to close: "
if errorlevel 2 exit /b 1
goto ask

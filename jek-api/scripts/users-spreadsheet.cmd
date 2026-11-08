@echo off
rem JEKray accounts spreadsheet: double-click this file, or a copy of it on your desktop.
rem It saves everyone with an account as jekray-accounts-<date>.csv on your desktop and opens it (Excel, or
rem whatever opens .csv files). The first time, it asks for the OPS_TOKEN value, and where jek-api is if needed.
setlocal
title JEKray accounts spreadsheet

where node >nul 2>nul
if errorlevel 1 goto nonode

rem Find the jek-api folder: beside this file when it is in jek-api\scripts, or the folder
rem remembered from the first run (JEK_API_DIR), or ask once. So a copy on the desktop works too.
set "API_DIR="
if exist "%~dp0users.mjs" set "API_DIR=%~dp0.."
if defined API_DIR goto found
if defined JEK_API_DIR if exist "%JEK_API_DIR%\scripts\users.mjs" set "API_DIR=%JEK_API_DIR%"
if defined API_DIR goto found
:askdir
echo.
echo Where is your jek-api folder? In File Explorer, open the jek-api folder of the jeksys.net
echo repository, click the address bar, copy the path, paste it here (right-click pastes) and press Enter.
set "API_DIR="
set /p "API_DIR=Folder: "
if not defined API_DIR exit /b 1
set "API_DIR=%API_DIR:"=%"
if exist "%API_DIR%\scripts\users.mjs" goto keepdir
echo That folder has no scripts\users.mjs in it. Try again.
goto askdir
:keepdir
setx JEK_API_DIR "%API_DIR%" >nul
:found
cd /d "%API_DIR%"

if defined JEK_OPS_TOKEN goto run
:ask
echo.
echo JEKray accounts spreadsheet: paste the OPS_TOKEN value ^(right-click pastes^), then press Enter.
set "JEK_OPS_TOKEN="
set /p "JEK_OPS_TOKEN=Token: "
if not defined JEK_OPS_TOKEN exit /b 1
setx JEK_OPS_TOKEN "%JEK_OPS_TOKEN%" >nul

:run
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESK=%%D"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"`) do set "TODAY=%%T"
if not defined DESK set "DESK=%USERPROFILE%\Desktop"
set "OUT=%DESK%\jekray-accounts-%TODAY%.csv"
echo Fetching everyone with an account...
node scripts\users.mjs --csv "%OUT%" >nul
if errorlevel 1 goto failed
start "" "%OUT%"
exit /b 0

:failed
echo.
choice /c RQ /n /m "Press R to enter the token again, or Q to close: "
if errorlevel 2 exit /b 1
goto ask

:nonode
echo Node.js is not installed, or not on the PATH. Install it from nodejs.org, then try again.
pause
exit /b 1

@echo off
title PlanMapper
cd /d "%~dp0planscale"

if not exist node_modules (
  echo First-time setup: installing dependencies. This can take a minute...
  call npm install
)

echo.
echo Starting PlanMapper. Your browser will open automatically.
echo Keep this window open while you use the app. Close it to stop.
echo.

call npm run dev -- --open

pause

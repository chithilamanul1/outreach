@echo off
cd /d "%~dp0"
title Ocean Way Tours Hotel Rate Hunter

:: Start the Ocean Way Tours Master Dashboard & Background Harvester
node --env-file=.env dashboard.js

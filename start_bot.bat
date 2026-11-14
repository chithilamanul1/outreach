@echo off
cd /d "%~dp0"
title Seranex Lanka Solutions - AI Outreach & Sales Agent Hub

:: Start Seranex Lanka Solutions Command Center & Autonomous Salesbot
node --env-file=.env dashboard.js

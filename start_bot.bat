@echo off
cd /d "%~dp0"
title Seranix Digital - AI Outreach & Sales Agent Hub

:: Start Seranix Digital Command Center & Autonomous Salesbot
node --env-file=.env dashboard.js

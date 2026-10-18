@echo off
chcp 65001 >nul
title BIMDesign — Servidor Local
cd /d "%~dp0"
node server.cjs
pause

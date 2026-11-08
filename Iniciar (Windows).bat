@echo off
title Papeles de Banda
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0herramientas\servidor.ps1"
if errorlevel 1 pause

@echo off
setlocal
cd /d "%~dp0"
echo Iniciando el Dojo de Himeji...
start "White Castle Server" /min cmd.exe /k "%~dp0white-castle-server.cmd"
timeout /t 2 /nobreak >nul
echo Abriendo http://127.0.0.1:5174/white-castle.html
start "" "http://127.0.0.1:5174/white-castle.html"

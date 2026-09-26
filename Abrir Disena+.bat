@echo off
title Disena+ (no cierres esta ventana mientras usas la app)
cd /d "%~dp0"
echo.
echo  Encendiendo Disena+ ...
echo  La app se abrira en tu navegador: http://localhost:5173
echo  Para apagarla, cierra esta ventana.
echo.
start "" cmd /c "timeout /t 3 >nul && start http://localhost:5173"
"C:\Program Files\nodejs\node.exe" node_modules\vite\bin\vite.js --port 5173
pause

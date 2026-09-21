@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js topilmadi. https://nodejs.org dan "LTS" versiyasini o'rnating,
  echo  keyin bu faylni qayta ishga tushiring.
  echo.
  pause
  exit /b 1
)
echo.
echo  UZ News ishga tushmoqda...  Brauzerda oching:  http://localhost:3000
echo  (To'xtatish uchun bu oynani yoping yoki Ctrl+C bosing)
echo.
node --no-warnings server.js
echo.
pause

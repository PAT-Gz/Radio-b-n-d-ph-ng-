@echo off
setlocal
chcp 65001 > nul
echo ========================================================
echo   RADIO VN - KENH PHAT THANH AI CA NHAN HOA
echo   He thong phat thanh thong minh cho nguoi ban ron
echo ========================================================
echo.

cd /d "%~dp0backend"
echo [1/2] Dang khoi dong may chu FastAPI tai http://127.0.0.1:8000...
start "" http://127.0.0.1:8000
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
pause
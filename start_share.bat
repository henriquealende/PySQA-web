@echo off
title PySQA Web — Share via ngrok
set ROOT=%~dp0

echo.
echo =============================================
echo  PySQA Web — Build + Share
echo =============================================
echo.

:: Step 1: Build frontend
echo [1/3] Building frontend...
cd /d "%ROOT%frontend"
call npm run build
if errorlevel 1 (
    echo.
    echo ERROR: Frontend build failed.
    pause & exit /b 1
)

:: Step 2: Start backend — tenta uvicorn do .venv, senao do PATH
echo.
echo [2/3] Starting backend on port 8000...
cd /d "%ROOT%backend"

if exist ".venv\Scripts\uvicorn.exe" (
    start "PySQA Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000"
) else (
    start "PySQA Backend" cmd /k "python -m uvicorn main:app --host 0.0.0.0 --port 8000"
)

echo Aguardando backend iniciar...
timeout /t 5 /nobreak >nul

:: Verificar se backend respondeu
curl -s http://localhost:8000/api/health >nul 2>&1
if errorlevel 1 (
    echo.
    echo AVISO: Backend pode nao ter iniciado ainda.
    echo        Verifique a janela "PySQA Backend" para ver o erro.
    echo        Pressione qualquer tecla para tentar o ngrok mesmo assim.
    pause
)

:: Step 3: ngrok
echo.
echo [3/3] Iniciando tunel ngrok...
echo.
echo  A URL publica vai aparecer abaixo - compartilhe com seu amigo!
echo  Feche esta janela para parar o compartilhamento.
echo.

if exist "%ROOT%ngrok.exe" (
    "%ROOT%ngrok.exe" http 8000
) else (
    ngrok http 8000
)

if errorlevel 1 (
    echo.
    echo ERRO: ngrok nao encontrado.
    echo Coloque ngrok.exe em: %ROOT%
    pause
)

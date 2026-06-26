# PySQA Web — Start Frontend (Windows PowerShell)
Set-Location "$PSScriptRoot\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies (first run may take a few minutes)..." -ForegroundColor Cyan
    npm install --legacy-peer-deps
}

Write-Host "`nStarting Vite dev server on http://localhost:5173`n" -ForegroundColor Green
npm run dev

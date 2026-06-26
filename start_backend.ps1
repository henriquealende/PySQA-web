# PySQA Web — Start Backend (Windows PowerShell)
Set-Location "$PSScriptRoot\backend"

if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv .venv
}

.\.venv\Scripts\Activate.ps1

Write-Host "Installing / updating dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt -q

Write-Host "`nStarting FastAPI on http://localhost:8000" -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/docs`n"
python -m uvicorn main:app --reload --port 8000

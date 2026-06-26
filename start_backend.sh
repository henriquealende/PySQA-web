#!/bin/bash
# PySQA Web — Start Backend (Linux / macOS)
cd "$(dirname "$0")/backend"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install -r requirements.txt -q

echo ""
echo "Starting FastAPI on http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo ""
python -m uvicorn main:app --reload --port 8000

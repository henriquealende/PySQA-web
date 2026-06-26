#!/bin/bash
# PySQA Web — Start Frontend (Linux / macOS)
cd "$(dirname "$0")/frontend"

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install --legacy-peer-deps
fi

echo "Starting Vite dev server on http://localhost:5173"
npm run dev

# PySQA Web

Web version of [PySQA](https://github.com/henriquealende/PySQA) -- Python Sound Quality Analyser.

**Stack:** FastAPI (Python) - React 18 + TypeScript + Vite - Plotly.js - Tailwind CSS - Zustand

---

## Requirements

| Tool | Minimum version |
|------|----------------|
| Python | 3.10 |
| Node.js | 18 |
| npm | 9 |

> On Windows, running scripts requires PowerShell execution policy to allow local scripts:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

---

## Quick Start

Open **two terminals** in the project root folder (`PySQA web/`).

### Terminal 1 -- Backend (FastAPI)

**Windows (PowerShell):**
```powershell
.\start_backend.ps1
```

**Linux / macOS:**
```bash
./start_backend.sh
```

What the script does on first run:
1. Creates a Python virtual environment in `backend/.venv`
2. Installs all dependencies from `backend/requirements.txt`
3. Starts the FastAPI server on **http://localhost:8000**

Interactive API docs available at **http://localhost:8000/docs**

---

### Terminal 2 -- Frontend (Vite + React)

**Windows (PowerShell):**
```powershell
.\start_frontend.ps1
```

**Linux / macOS:**
```bash
./start_frontend.sh
```

What the script does on first run:
1. Runs `npm install --legacy-peer-deps` to install all Node dependencies
2. Starts the Vite dev server on **http://localhost:5173**

The frontend proxies all `/api` requests to `http://localhost:8000`.

---

## Manual Setup (without scripts)

### Backend
```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

---

## Optional: `sottek_hearing_model` (ECMA-418-2 metrics)

Loudness ECMA-418-2, Roughness ECMA-418-2 and Tonality ECMA-418-2 require the
`sottek_hearing_model` Python package (commercial licence, not included).
Without it, those three metrics are disabled; all other features work normally.

---

## Project Structure

```
PySQA web/
+-- backend/
|   +-- main.py                  # FastAPI entry point
|   +-- requirements.txt
|   +-- routers/
|   |   +-- audio.py             # Upload, visualisation, psychoacoustic metrics
|   |   +-- processing.py        # Filter, window, weighting, loudness adj.
|   |   +-- export.py            # WAV / XLSX / CSV download
|   +-- services/
|   |   +-- session_store.py     # In-memory session management
|   |   +-- audio_service.py     # Signal processing & metrics logic
|   +-- psychoacoustics/         # Psychoacoustic metric implementations
|   +-- processing/              # DSP helpers (filtering, windowing)
|
+-- frontend/
|   +-- src/
|       +-- pages/PostProcessing/
|       |   +-- PostProcessingPage.tsx
|       |   +-- BatchPanel.tsx
|       +-- components/
|       |   +-- PlotPanel.tsx        # All Plotly.js plots
|       |   +-- ProcessingModal.tsx  # DSP processing panel
|       +-- store/useStore.ts        # Zustand global state
|       +-- api/                     # Typed fetch wrappers
|       +-- types/index.ts
|
+-- start_backend.ps1 / start_backend.sh
+-- start_frontend.ps1 / start_frontend.sh
+-- README.md
```

---

## Implemented Features (Post-Processing)

| Feature | Status |
|---------|--------|
| WAV upload (drag-and-drop or click) | Done |
| File list with metadata | Done |
| Waveform + Spectrum | Done |
| Spectrogram (STFT heatmap) | Done |
| 1/3-Octave bands (Z / A weighting) | Done |
| Signal envelope | Done |
| Loudness ISO 532-1 Zwicker | Done |
| Sharpness DIN 45692 | Done |
| Roughness Daniel & Weber | Done |
| Fluctuation Strength D&W | Done |
| IPM (Impulse Prominence Metric) | Done |
| Loudness ECMA-418-2 | Done (requires sottek_hearing_model) |
| Roughness ECMA-418-2 | Done (requires sottek_hearing_model) |
| Tonality ECMA-418-2 | Done (requires sottek_hearing_model) |
| Filters (HP / LP / BP / Notch) | Done |
| Time windowing | Done |
| Loudness adjustment | Done |
| Microphone calibration (mV/Pa) | Done |
| Field type selector (free / diffuse) | Done |
| Batch analysis | Done |
| Annoyance indices (SIL, Zwicker-Fastl) | Done |
| Export WAV / XLSX / CSV | Done |
| Audio playback (Web Audio API) | Done |

---

## Roadmap

- **Phase 2** -- Data Acquisition (live microphone recording via WebSocket)
- **Phase 3** -- System Analysis (FRF / Nyquist / coherence via UFF files)

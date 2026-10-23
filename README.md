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

## ECMA-418-2 metrics (`sottek-hearing-model`)

Loudness, Roughness and Tonality ECMA-418-2 use the `sottek-hearing-model` package, which is pinned in
`backend/requirements.txt` and installed with the other dependencies. If the import fails in some environment,
those three metrics are disabled and all other features keep working.

---

## Hosted deployment: resource limits

On a small container (the project runs on the Render Standard plan, 2 GiB and 1 CPU; it used to run on Starter, 512 MiB) the server protects itself instead of
running out of memory. The limits switch on automatically when a memory limit is detected (the
container's cgroup limit, `PYSQA_MEMORY_MB`, or the `RENDER` variable) and stay off on a local
machine. `GET /api/health` reports the limits in force.

| Variable | Hosted default (512 MiB; ×4 on 2 GiB) | Meaning |
|----------|--------------------------|---------|
| `PYSQA_MEMORY_MB` | detected | Memory budget of the process |
| `PYSQA_MAX_UPLOAD_MB` | 30 | Largest upload |
| `PYSQA_MAX_AUDIO_SECONDS` | 60 | Longest file |
| `PYSQA_MAX_FILES_PER_SESSION` | 20 | Uploads plus processed copies in one session |
| `PYSQA_MAX_AUDIO_RAM_MB` | 120 | float64 audio held in RAM across all sessions |
| `PYSQA_SESSION_IDLE_MIN` | 30 | Minutes without activity before a session is dropped |
| `PYSQA_HEAVY_WAIT_S` | 120 | How long a heavy calculation waits for its turn |
| `PYSQA_MAX_EXPORT_CELLS` | 100000 | Largest Excel table the server builds (CSV is made in the browser) |
| `PYSQA_TMP_DIR` | `backend/tmp_sessions` | Where session files are kept |

Set a limit to `0` to disable it alone; larger containers get proportionally larger defaults.
Only one heavy calculation runs at a time, and a calculation whose estimated memory does not fit is
refused up front with a message instead of crashing the process. Measured on a 512 MiB container:
Loudness ISO 532-1 and Sharpness accept about 4-5 s of audio, Loudness ECMA-418-2 about 1.7 s, and
Roughness / Tonality ECMA-418-2 do not fit at all (they need roughly 440 and 540 MB per second of audio).
On the 2 GiB Standard plan the caps are four times larger (120 MB upload, 240 s, 80 files, 480 MB of audio, 400000 cells)
and, estimated from the same cost table, Loudness ISO 532-1 and Sharpness accept about 30 s, Loudness ECMA-418-2 about 10 s,
and Roughness / Tonality ECMA-418-2 about 2.5-3 s.

On Linux the server also tunes the memory allocator when the limits are on: it answers each request in
its own thread, and without this the memory freed by one calculation stayed in that thread's arena, so the
free memory shrank after every heavy calculation (a 512 MiB container ended up refusing a 3 s section).
`GET /api/health` shows `allocator_tuned`; setting `MALLOC_ARENA_MAX` or `MALLOC_MMAP_THRESHOLD_` yourself
leaves it alone.

A longer file can still be analysed in pieces: select a section (drag on the waveform in the Normal view, or
type the limits in the Section bar). Every analysis (spectrum, spectrogram, 1/3-octave, envelope, metrics,
batch) then runs on that part only, and the memory check is made on the length of the section. The API takes
the same `t0` / `t1` (seconds) on the view endpoints and in the body of `/metrics`, and `sections`
(`audio_id` -> `[t0, t1]`) in the body of `/batch`.

---

## Session recovery

The server keeps uploaded files in memory and on a temporary disk, so a restart, a deploy or an
out-of-memory kill wipes every session. To make that invisible, the browser keeps what is needed to
rebuild its session in its own IndexedDB: a copy of each uploaded WAV and the processing steps applied
to it (nothing is sent anywhere else). The browser also chooses the id of every file it uploads or
creates, so a restored file comes back under the same id and nothing on screen changes.

- After a page reload the file list, selection and microphone calibrations come back.
- When the server answers 404 for a file it forgot, the missing files are re-uploaded and the processing
  steps replayed (parents first), then the request is repeated; a banner shows the progress.
- A request that stays pending while `/api/health` does not answer shows a "server is not responding" banner.
- Copies of sessions untouched for 7 days are deleted; **Clear & re-upload** forgets the current session's copy.
- Recordings made in Data Acquisition are copied the same way once they are sent to Post-Processing.

---

## Project Structure

```
PySQA web/
+-- backend/
|   +-- main.py                  # FastAPI entry point; also serves frontend/dist
|   +-- requirements.txt
|   +-- routers/
|   |   +-- audio.py             # Upload, visualisation, psychoacoustic metrics
|   |   +-- processing.py        # Filter, window, weighting, loudness adj.
|   |   +-- export.py            # WAV / XLSX / CSV download
|   |   +-- frf.py               # System Analysis (FRF) endpoints
|   +-- services/
|   |   +-- session_store.py     # In-memory session management
|   |   +-- audio_service.py     # Signal processing & metrics logic
|   |   +-- frf_service.py       # FRF estimators, coherence, modes, damping, UFF/WAV/CSV readers
|   +-- psychoacoustics/         # Psychoacoustic metric implementations
|   +-- processing/              # DSP helpers (filtering, windowing)
|   +-- utils/                   # lang (PT/EN server messages), limits (memory guard), samples
|
+-- frontend/
|   +-- public/                  # Logo and the recorder AudioWorklet
|   +-- src/
|       +-- pages/PostProcessing/    # Post-Processing and Batch
|       +-- pages/SystemAnalysis/    # FRF page and plots
|       +-- pages/DataAcquisition/   # Recording, calibration wizard, SPL meter
|       +-- pages/Docs/              # Documentation pages (PT/EN) and demo data
|       +-- components/              # Plot panel, processing modal, layout, shared UI
|       +-- i18n/                    # PT (default) / EN dictionaries in locales/<lang>/
|       +-- store/                   # Zustand stores
|       +-- api/                     # Typed fetch wrappers, session recovery, caches
|       +-- types/index.ts
|
+-- dev-tests/                   # Development checks (see its README); archive/ holds one-off scripts
+-- render.yaml                  # Render deployment (single web service)
+-- PROJECT_MAP.md               # Map of the repository and cleanup notes
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
| Analyse only a section of a file (drag on the waveform or type the limits) | Done |
| Loudness adjustment | Done |
| Microphone calibration (mV/Pa) | Done |
| Field type selector (free / diffuse) | Done |
| Batch analysis | Done |
| Annoyance indices (SIL, Zwicker-Fastl) | Done |
| Export WAV / XLSX / CSV | Done |
| Audio playback (Web Audio API) | Done |
| Lossless WAV playback and download (the upload is kept as sent; processed files are 32-bit float) | Done |
| Data Acquisition: microphone calibration wizard (acoustic calibrator or typed sensitivity), carried into Post-Processing | Done |
| Data Acquisition: live sound level meter (dB SPL or dB(A), Leq, Max, Peak) | Done |
| Data Acquisition: exact fixed duration, silence stop and level trigger (counted in samples inside the AudioWorklet) | Done |

---

## Modules

- **Post-Processing** -- the features listed above.
- **Data Acquisition** -- live recording, calibration wizard, level meter (done; see the Documentation page).
- **System Analysis** -- FRF (H1 / H2 / HT), coherence, impact testing, modes and damping, UFF/WAV/CSV input (done).

## Deployment

Hosted on Render (`render.yaml`): one web service, Standard plan (2 GiB, 1 CPU). The build installs the backend,
builds the frontend and FastAPI serves it; `/api/health` is the health check and `main` deploys automatically.
The disk is ephemeral, so the browser keeps a copy of the uploaded files and restores them after a restart.

# dev-tests

Checks used while developing PySQA-Web. They are not part of the app.

Server checks (each starts its own server on a port 83xx with a temporary session folder, so
`backend/tmp_sessions` is never touched). Run them from the `backend` folder with its virtualenv:

```
cd backend
.venv\Scripts\python.exe ..\dev-tests\test_jobs.py
```

`test_jobs`, `test_fidelity`, `test_section`, `test_limits`, `test_ids`, `test_export`: 149 checks in total,
all of them must end with `FAILS: 0 []`.

`test_frf` (System Analysis) needs no server: it builds a system with known modes and checks the FRF estimators,
coherence, impact averaging, mode detection and damping, and the UFF/WAV/CSV readers.

`test_aural` (Audio Preparation, phase 1): 38 checks on the spherical-head model, the SOFA reader and its azimuth sign, the chain and the API (its own server on port 8350); needs `h5py`.

Other files:
- `test_aweight.js` (Node): the A-weighting filter of the recorder against IEC 61672.
- `archive/` (`docker-test/`, `drive.py`, `stress.py`, `memexp.py`, `probe_wav.py`, `recv.py`, `seed_fidelity.py`, `check_exports.py`; one-off diagnostics, kept for reference): reproduce the old Render Starter plan (512 MB, 0.5 CPU) in Docker; for the current Standard plan (2 GB, 1 CPU) use `--memory=2g --cpus=1` and measure memory.
- `edits.py`: exact-once text replacement; the Edit tool has truncated files on the OneDrive folder.

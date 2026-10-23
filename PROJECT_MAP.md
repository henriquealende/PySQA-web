# PySQA Web — Mapa do projeto

Repositório = esta pasta (`PySQA web`). Deploy: Render (`render.yaml`), um único serviço FastAPI que também serve o frontend compilado.

## Estrutura (o que é cada coisa)

| Caminho | Papel | Estado |
|---|---|---|
| `backend/main.py` | App FastAPI, handlers, `/api/health`, serve `frontend/dist` | em uso |
| `backend/routers/` | `audio`, `processing`, `export`, `frf`, `feedback`, `auralization` | em uso |
| `backend/services/` | `audio_service`, `session_store`, `frf_service` | em uso |
| `backend/processing/` | filtros e janelamento | em uso |
| `backend/auralization/` | HRTF (SOFA e modelo esférico), respostas de sala (RIR/BRIR) com parâmetros ISO 3382, sala sintética e ruído de fundo (cenários rápidos), cadeia de renderização, catálogo de bases abertas com licença | em uso (fases 1 e 2; plano em `PLANO_PREPARACAO_AUDIOS.md`) |
| `backend/psychoacoustics/` | loudness, sharpness, roughness, FS, tonalidade, IPM (`mpi.py`) | em uso |
| `backend/utils/` | `lang`, `limits`, `samples` | em uso |
| `frontend/src/` | App React: `pages/` (PostProcessing, SystemAnalysis, DataAcquisition, Docs), `components/`, `api/`, `store/`, `hooks/`, `i18n/` | em uso |
| `frontend/public/` | logo e `recorder-processor.js` (worklet) | em uso |
| `dev-tests/` | verificações de desenvolvimento (não fazem parte do app) | ver abaixo |
| `render.yaml` | Blueprint do Render | em uso |
| `start_backend.*`, `start_frontend.*` | subir o app local (o README os cita) | em uso |
| `start_share.bat` + `ngrok.exe` | compartilhar via túnel ngrok (antes do Render) | obsoleto |

## Código órfão no git (nenhum arquivo importa)

- `backend/psychoacoustics/graph_utils.py` (275 linhas) — código do PySQA desktop (PySide6/QtCharts, imports `Utils.*` e `Psychoacoustics.*` com maiúscula, que nem existem aqui).
- `backend/utils/audio_utils.py` (202 linhas) — player desktop (`sounddevice`).

São a única origem de `PySide6`, `sounddevice` e `tqdm` no backend. Remoção segura; fica no histórico do git.

## Candidatos a limpeza

1. **`start_share.bat` e `ngrok.exe` (32 MB)** — o ngrok não é mais necessário com o Render. `ngrok.exe` já está no `.gitignore` (só ocupa disco); o `.bat` está versionado.
2. **`backend/tmp_sessions/` (94 itens, 128 MB)** — sessões locais antigas; ignorado pelo git; apagar com o servidor parado.
3. **Fora do repositório** (pasta `PySQA-Web/`, acima desta):
   - `CLAUDE.md` (10 KB, de 29/05) — versão antiga e desatualizada, duplica o do repositório.
   - `PySQA_Web_Plan.md` — plano original de maio; histórico.
   - `zinOxI1C` (69 KB) — arquivo zip sem extensão, de 28/05, com cópia antiga dos scripts `start_*`. Lixo.
   - `.claude/` — `launch.json` e `start-frontend.cjs` do preview; úteis só para a ferramenta.
4. **Dependências do `backend/requirements.txt` sem uso no código**: `aiofiles`, `tqdm` e `bottleneck` (nenhum import direto; `bottleneck` pode ser exigido por outra lib, testar). `matplotlib` só em `mpi.py`, num método de diagnóstico opcional. Retirar reduz o build no Render, mas validar com a suíte antes.
5. **`CLAUDE.md` do repositório** — lista como "faltando" itens que já foram feitos (calibração, opções de spectrogram/envelope/octave, field type, annoyance, FRF, aquisição). Vale reescrever.
6. **`dev-tests/`** — 24 arquivos. Testes de verdade: `test_*.py` e `test_*.js`. Scripts de uso único/diagnóstico (candidatos a arquivar): `memexp.py`, `probe_wav.py`, `recv.py`, `seed_fidelity.py`, `check_exports.py`, `drive.py`, `stress.py`, `docker-test/` (simulavam o plano Starter de 512 MB, já trocado pelo Standard). `edits.py` é um workaround do Edit no OneDrive.

## Falsos órfãos (parecem sem uso, mas estão em uso)

- `frontend/src/i18n/locales/*/*.ts`: carregados por `import.meta.glob` em `i18n/index.ts`.
- `frontend/vite.config.ts` e os `.d.ts`: lidos pelas ferramentas de build.
- Todos os componentes e páginas do frontend têm pelo menos um importador.

# Plano: página Auralização (preparação de estímulos)

Rota `/auralization`. Cadeia: **Fonte → Ambiente (RIR/BRIR) → HRTF → Fone → Nível**, com prévia A/B, exportar WAV e "Enviar para análise" (cria um áudio estéreo na sessão, que aparece no Post-Processing).
Design aprovado no chat (cenários rápidos, 4 blocos, mapa da fonte, resposta da cadeia, A/B).

## 1. Decisões de arquitetura (pelo que o código já faz)

| Tema | Decisão | Por quê |
|---|---|---|
| Onde roda | Backend (FastAPI), com o mesmo "slot pesado" de `utils/limits.py` | Render Standard: 2 GB, 1 CPU, disco efêmero; convolução longa não pode derrubar as outras sessões |
| Convolução | `scipy.signal.oaconvolve` (FFT em blocos), float32 onde der | já há scipy; evita arquivos longos virarem centenas de MB |
| Saída | novo `AudioEntry` estéreo via `add_entry` (como `processing.py`), aceita `new_audio_id` | reaproveita sessão, restauração pelo navegador e Post-Processing |
| Arquivos do usuário (SOFA, RIR, CSV de fone) | guardados na sessão (`tmp_sessions/<sessão>/aural/`), limitados por `limits` | mesma política dos áudios |
| Bases embutidas | só um conjunto **pequeno e curado** no repositório (`backend/data/auralization/`, meta ≤ 30 MB) + `catalog.json` com licença e referência de cada item | repositório e deploy leves; o resto entra por upload |
| Leitura de SOFA | `sofar` (usa `netCDF4`); testar o build no Render antes de depender | SOFA é HDF5/netCDF |
| Cadeia salva | JSON baixado/enviado pelo navegador (sem banco) | reprodutibilidade; combina com sessões efêmeras |
| Taxa de amostragem | tudo reamostrado para a taxa da fonte (`resample_poly`), com aviso | HRIR 44,1/48/96 kHz, RIR variadas |

### Como combinar RIR e HRTF (ponto delicado)
- **BRIR (binaural)**: já inclui a cabeça; o bloco HRTF fica desligado (a UI avisa).
- **RIR mono/omni + HRTF**: som direto = fonte ⊛ HRIR(az, el); cauda reverberante = fonte ⊛ cauda da RIR, em duas versões descorrelacionadas (L/R). Aproximação simples e honesta; fica escrita na documentação.
- **Só HRTF**: campo livre (câmara anecoica virtual).
- **RIR de matriz esférica (IR64-CAR)**: fase 7 (decodificação ambisônica → binaural).

## 2. Backend

### Arquivos novos
```
backend/auralization/__init__.py
backend/auralization/sofa_io.py      # lê SOFA -> HRIRs (N,2,T), posições, taxa
backend/auralization/hrtf.py         # escolhe direção (vizinho mais próximo; depois interpolação), ITD preservado
backend/auralization/headphone.py    # lê CSV (freq, dB), alvo, filtro inverso regularizado, FIR de fase mínima
backend/auralization/rir.py          # carrega RIR, normaliza, separa direto/cauda, métricas (RT60, EDT, C50, C80, D50)
backend/auralization/rir_synth.py    # RIR sintética por banda (RT60 por oitava + cauda de ruído); depois image-source
backend/auralization/level.py        # nível: dBFS, LUFS, SPL alvo, SNR com ruído de fundo
backend/auralization/chain.py        # valida o JSON da cadeia e executa bloco a bloco
backend/auralization/catalog.json    # itens embutidos: id, tipo, arquivo, licença, referência (id do refs.ts)
backend/data/auralization/...        # arquivos pequenos curados
backend/routers/auralization.py      # rotas abaixo (prefixo /api/auralization)
dev-tests/test_aural.py
```
Alterações: `main.py` (incluir o router), `requirements.txt` (`sofar`), `utils/limits.py` (limite de tamanho dos arquivos de apoio), `render.yaml` só se precisar de variável nova.

### Rotas
| Método e caminho | Função |
|---|---|
| `GET /catalog` | itens embutidos (HRTF, fones, RIR, cenários) com licença e referência |
| `POST /{session}/assets` | upload de SOFA, RIR (WAV) ou CSV de fone; devolve `asset_id` e metadados |
| `DELETE /{session}/assets/{asset_id}` | remove |
| `GET /{session}/assets/{asset_id}/info` | taxa, nº de direções, duração, RT60 etc. |
| `POST /rir/synth` | gera RIR sintética (volume, RT60 por oitava, distância) e guarda como asset |
| `POST /{session}/preview` | renderiza só um trecho (até ~10 s) com a cadeia e devolve WAV para tocar |
| `POST /{session}/render` | renderiza tudo e cria `AudioEntry` estéreo; devolve `audio_id` |
| `POST /{session}/response` | resposta em magnitude da cadeia (E/D) para o gráfico, sem usar o áudio |

Corpo de `preview`/`render` (esboço):
```json
{ "audio_id": "...", "blocks": {
    "environment": {"type": "rir|brir|none", "asset": "...", "gain_db": 0},
    "hrtf":        {"enabled": true, "asset": "...", "azimuth": 30, "elevation": 0, "distance_m": 2},
    "headphone":   {"mode": "compensate|simulate|off", "asset": "...", "target": "diffuse|free|harman"},
    "level":       {"target_db_spl": 60, "noise_asset": "...", "snr_db": 15} },
  "new_audio_id": null }
```
Todas as mensagens de erro via `msg(pt, en)`; trabalho pesado dentro do slot de `limits`.

### Regras de cálculo
- **Fone, compensar**: `H_comp = alvo / H_fone` suavizado (1/6 de oitava), regularizado, ganho máximo de +12 dB, FIR de fase mínima (`scipy.signal.minimum_phase`) de 1024 a 4096 taps.
- **Fone, simular**: aplica `H_fone` (fase mínima) ao sinal.
- **Nível**: o WAV continua em escala digital; "dB SPL alvo" usa a mesma lógica de `calibration_pa`, e a UI avisa que a reprodução real depende do fone e da placa. Nunca prometer SPL absoluto.
- **Distância**: atenuação 1/r e, opcional, absorção do ar (ISO 9613-1), fase 7.
- **Clipping**: normaliza com aviso se o pico passar de 0 dBFS; nunca satura em silêncio.

## 3. Frontend

### Arquivos novos
```
frontend/src/pages/Auralization/AuralizationPage.tsx     # layout do mockup
frontend/src/pages/Auralization/blocks/SourceBlock.tsx   # escolhe áudio da sessão (reusa AudioList/FileDropzone)
frontend/src/pages/Auralization/blocks/EnvironmentBlock.tsx  # cenários rápidos + RIR (catálogo/upload/sintética)
frontend/src/pages/Auralization/blocks/HrtfBlock.tsx     # SOFA + mapa de posição (SVG, arrastável)
frontend/src/pages/Auralization/blocks/HeadphoneBlock.tsx
frontend/src/pages/Auralization/blocks/LevelBlock.tsx
frontend/src/pages/Auralization/ChainResponsePlot.tsx    # Plotly via components/Plot (teal = E, orange = D)
frontend/src/pages/Auralization/AbPlayer.tsx             # dois <audio> sincronizados, alterna Processado/Original
frontend/src/pages/Auralization/scenes.ts                # presets: cozinha, carro, avião, sala
frontend/src/api/auralizationApi.ts
frontend/src/i18n/locales/{pt,en}/auralization.ts        # PT padrão, EN junto (glossário do projeto)
```
Alterações: `App.tsx` (rota), `Layout.tsx` (item de menu), `types/index.ts` (tipos da cadeia), `store/useStore.ts` (estado da cadeia + "áudio enviado para análise"), `DocsPage.tsx` e `tocs.ts` (nova página de documentação).

### Cenários rápidos (`scenes.ts`)
Cada cenário é um pacote: RIR (embutida, upload ou sintética) + ruído de fundo opcional + nível sugerido.
- **Cozinha**: eBrIRD (se a licença permitir) ou sintética (≈ 3 × 4 × 2,6 m, RT60 ≈ 0,5–0,7 s).
- **Carro**: McVAMPIRE (RIR + ruído de rodagem).
- **Avião**: sem base aberta; sintética de cabine (RT60 curto) + upload de ruído do usuário.
- **Sala**: OpenAIR / BUT ReverbDB / AIR de Aachen.
- **Livre**: monta do zero.

### Prévia
Fase 1: render no backend de ≤ 10 s, toca o WAV; A/B alterna entre o original e o processado no mesmo instante. Fase 7: `ConvolverNode` do Web Audio para prévia ao mover a fonte.

## 4. Documentação (regra do projeto: toda feature nova entra em `/docs`)
- `frontend/src/pages/Docs/AuralizationDoc.tsx` (PT) e versão EN, `tocs.ts`, entrada em `PAGES` de `DocsPage.tsx`.
- Gráficos de exemplo calculados pelo próprio backend: estender `dev-tests/gen_docs_data.py` (ex.: HRTF em 0° e 90°, compensação de um fone, decaimento de uma RIR sintética). `demoData.ts` não se edita à mão.
- Citar no texto as referências já em `refs.ts` (algazi2001, ari, kearney2024, pasanen, murphy2010, muller2024, lopezballester2025, ebrird, jeub2009, szoke2019, dicarlo2021) e o catálogo de licenças.

## 5. Testes (`dev-tests/test_aural.py`)
1. RIR = delta → saída igual à entrada (a convolução não altera nada).
2. HRTF a +90° de azimute: o ouvido direito recebe antes e mais forte que o esquerdo (ITD/ILD com o sinal certo).
3. Compensação de um fone sintético → resposta final plana dentro de ±1 dB entre 100 Hz e 10 kHz.
4. RIR sintética: RT60 medido (Schroeder) bate com o pedido (±10 %).
5. Reamostragem: HRIR de 44,1 kHz com fonte de 48 kHz mantém o ITD.
6. Limites: arquivo grande demais devolve 413 com mensagem PT/EN; sessão expirada devolve 404 tratado.
7. "Enviar para análise": o áudio criado abre no Post-Processing, com o aviso de um canal (`ChannelNotice`) quando for o caso.

## 6. Ordem de implementação

| Fase | Entrega | Verificação |
|---|---|---|
| 0 | Catálogo e licenças: confirmar SADIE II / CIPIC / ARI e, para eBrIRD, AIR, dEchorate, IR64-CAR e dados do AutoEq, ler a licença de cada um antes de embutir | `catalog.json` revisado por você |
| 1 | `sofa_io`, `hrtf`, `chain` mínimo; rota `render`; página com Fonte + HRTF + A/B + exportar | testes 1, 2, 5 |
| 2 | RIR por upload + BRIR + `rir` (métricas); bloco Ambiente | teste 1 com BRIR |
| 3 | `headphone` (CSV próprio, alvo difuso/Harman) + gráfico da cadeia | teste 3 |
| 4 | Cenários rápidos (cozinha, carro, sala) + ruído de fundo/SNR + `level` | teste de nível/SNR |
| 5 | `rir_synth` (cabine de avião, cozinha típica) + RIR sintética na UI | teste 4 |
| 6 | Salvar/carregar cadeia (JSON), "Enviar para análise", docs completas (PT/EN) | teste 7 |
| 7 (depois) | Fonte em movimento, ambisonics (IR64-CAR), absorção do ar, prévia em tempo real | — |

Cada fase fecha com: testes passando, i18n PT/EN, documentação da parte pronta, commit só depois da sua aprovação.

## 7. Riscos e pontos em aberto
- **Licenças**: ARI é CC BY-SA 3.0 (derivados herdam); eBrIRD, AIR, dEchorate e dados do AutoEq ainda não confirmados; OpenAIR é por item.
- **Avião**: sem RIR aberta de cabine de passageiros; depende de upload ou síntese.
- **Memória**: SOFA grande (ARI) lê só a direção pedida; nunca carrega a base inteira em float64.
- **Disco efêmero**: bases embutidas vão no repositório; arquivos do usuário seguem a política atual (o navegador guarda cópia e restaura).
- **Nível absoluto**: sem calibração do fone, SPL só vale como referência; texto honesto na UI e na documentação.
- **Build no Render**: validar `sofar`/`netCDF4` antes da fase 1.

## 8. Andamento (2026-10-23)

### Fase 0: licenças
| Base | Resultado |
|---|---|
| SADIE II | Apache 2.0, confirmada na página do Zenodo |
| ARI | CC BY-SA 3.0, segundo a página do instituto (resultado de busca; a página não abriu direto) |
| dEchorate | CC BY 4.0, confirmada (o Zenodo avisa que há versão mais nova) |
| IR64-CAR | CC BY 4.0 e DOI 10.5281/zenodo.15168578 confirmados; `dataset.zip` de 24,1 MB, 8 arquivos de 64 canais |
| In-Car McVAMPIRE | CC BY 4.0, confirmada |
| BUT ReverbDB | CC BY 4.0 (artigo e página); a parte de fala retransmitida exige licença LDC |
| AutoEq | MIT só no código (copyright Jaakko Pasanen 2018-2022); licença dos dados de medição NÃO confirmada |
| CIPIC, eBrIRD, AIR de Aachen | sites não abriram (conexão recusada / HTTP 410): licença a confirmar |
| OpenAIR | licença por item |

Nada foi baixado nem embutido no repositório ainda. A fase 1 usa o modelo de cabeça esférica (calculado) e upload de SOFA.

### Fase 1: feito
- Backend: `backend/auralization/` (`sofa_io`, `hrtf`, `chain`, `assets`, `catalog.json`) e `routers/auralization.py` (`/catalog`, `/assets`, `/preview`, `/render`, `/response`). Leitura de SOFA com `h5py` (em vez de `sofar`, que não foi necessário).
- Frontend: página `/auralization` (`pages/Auralization/`), `api/auralizationApi.ts`, `store/useAuralStore.ts`, textos PT/EN, item de menu.
- Documentação: `AuralizationDoc` (PT) e `AuralizationDocEn`, mais 4 referências (BROWN; DUDA, WOODWORTH; SCHLOSBERG, BLAUERT, MAJDAK et al.).
- Testes: `dev-tests/test_aural.py` (38 verificações) e, no navegador, o ciclo completo: enviar WAV, posicionar, prévia A/B, gerar, abrir no Pós-processamento, reiniciar o servidor e ver o arquivo gerado voltar.

### Desvios do plano
- `h5py` no lugar de `sofar`.
- O preview e o render usam o corpo `{session_id, audio_id, blocks}` (sessão no corpo, como em `processing.py`), não a sessão no caminho.
- Download de WAV usa a rota de stream existente (`/api/audio/{sessão}/{id}/stream`).
- Arquivos gerados com SOFA enviado não são refeitos após reinício do servidor (o SOFA fica só na memória); os do modelo esférico são.

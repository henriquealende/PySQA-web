# Plano: página Preparação de áudios (EN: Audio Preparation)

Rota `/audio-preparation` (o código interno e a API continuam com o nome `auralization`; o nome da página foi trocado para não conflitar com a Auralize). Cadeia: **Fonte → Ambiente (RIR/BRIR) → HRTF → Fone → Nível**, com prévia A/B, exportar WAV e "Enviar para análise" (cria um áudio estéreo na sessão, que aparece no Post-Processing).
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

### Renomeação
A página passou a se chamar "Preparação de áudios" (EN: "Audio Preparation"): rota, menu, textos e documentação (`/docs/audio-preparation`). Nomes internos (pacote `backend/auralization`, rotas `/api/auralization/*`, arquivos e componentes do frontend) ficaram como estavam.

### Fase 2: feito (2026-10-23)
- Backend: `rir.py` (leitura de WAV de 1 ou 2 canais até 30 s; T20, T30, EDT, C50, C80, D50 e T20 por oitava de 125 Hz a 4 kHz, pela integral de Schroeder, com descarte do ruído de fundo; curva de decaimento) e `decorrelate` (passa-tudo de fase aleatória de 10 ms para a reverberação das duas orelhas). `assets.py` guarda HRTF e respostas de sala (até 4 de cada). `chain.py` ganhou o bloco Ambiente: RIR + HRTF (som direto pela HRIR, cauda depois de 2,5 ms descorrelacionada), BRIR (HRTF ignorada) e RIR sem HRTF. O filtro é escalado para manter a energia total igual à da cabeça sozinha (a sala não deixa o som mais alto); o controle de reverberação (−30 a +10 dB) mexe só no que vem depois do som direto.
- Rotas: `POST /assets` com `kind=rir`, `GET /{sessão}/assets/{id}/info` (parâmetros, bandas e decaimento) e `blocks.environment` em `/preview` e `/render`.
- Frontend: `EnvironmentSection` (tipo, arquivo, métricas, bandas, controle de reverberação), `DecayPlot`; o bloco 2 da cadeia ficou ativo.
- Documentação: seção "Ambiente: a sala no som" (PT e EN), equações 3 a 5 e 3 referências (ISO 3382-1, ISO 3382-2, Schroeder 1965).
- Testes: `test_aural.py` passou a ter 77 verificações (T20 e T30 de uma RIR sintética de 0,6 s dentro de 10 %, C50 e D50 contra a fórmula do decaimento exponencial, ruído de fundo a −65 dB, decorrelação, BRIR com atraso e nível entre as orelhas, ganho da reverberação, reamostragem, erros de arquivo e a API).
- Verificado no navegador: RIR sintética de 0,7 s deu T20 = 0,70 s; BRIR de 0,5 s deu T20 = 0,50 s; o arquivo gerado fica sem corte (pico de −4,6 dBFS no teste de BRIR).

### Ainda não feito
- Embutir bases de salas (cozinha, carro, avião) no servidor, bloco Fone, nível/SNR, RIR sintética e cenários rápidos (fases 3 a 5).
- Respostas de sala de mais de 2 canais (IR64-CAR) precisam ser reduzidas antes do envio.

### Cenários rápidos e ruído de fundo: feito (2026-10-23)
- Backend: `rir_synth.py` (RIR sintética: impulso após o tempo de percurso mais cauda de ruído por banda de oitava com o T60 pedido; nível da cauda pela distância crítica de Kuttruff, `(r/Dc)²`; semente fixa) e `noise.py` (ruído branco, rosa e marrom, independente em cada orelha, misturado com SNR sobre o arquivo inteiro). `chain.py` ganhou o passo de ruído. Rota `POST /rir/synth`; `blocks.noise` em `/preview` e `/render`; `catalog.json` com 4 cenários (cozinha, sala de estar, cabine de carro, cabine de avião) e a nota de que são valores de partida, não medições.
- Frontend: `ScenesBar` (chips), `SyntheticRoomForm` (volume, distância, T60 por banda), `NoiseSection`; a cadeia passou a ter 5 blocos (Fonte, Ambiente, HRTF, Ruído, Fone). Gerar uma sala sintética substitui a anterior, para não esgotar o limite de 4 respostas de sala.
- Documentação: seção "Cenários rápidos e ruído de fundo" (PT e EN), equações 6 e 7, frequência de Schroeder, aviso de que os valores não são medições; referência Kuttruff (2009).
- Testes: `test_aural.py` com 111 verificações (T20 por banda da sala sintética, razão entre cauda e som direto, determinismo, inclinação espectral dos ruídos, SNR medida, rotas e erros).
- Valores dos cenários: a busca não achou tabelas publicadas de tempo de reverberação por banda para cozinha, carro e cabine de avião; por isso os valores são pontos de partida escolhidos pelo PySQA e assim estão descritos na interface e na documentação. Só o nível de ruído de cabine de avião (cerca de 71 a 85 dB(A) em cruzeiro) apareceu em resumos de busca; não foi usado nem citado, porque não consegui abrir as fontes.

### Ainda não feito
- Bloco Fone; nível absoluto (dB SPL alvo); embutir bases medidas (cozinha, carro) no servidor, dependendo da licença; ruído de cabine gravado.

### Card "Da equipe Auralize" (Auralize Salas): feito (2026-10-23)
- Componente `AuralizeSalasCard` no bloco Ambiente, e chip "Construir minha sala" nos Cenários rápidos que leva até ele. Marca conforme o kit de identidade (fundo Noite, Ciano, Petróleo, Grafite; logotipo oficial em degradê, 110 px de largura, acima do mínimo de 100 px; título em Inter bold com tarja ciano na palavra-chave; pergunta + dado; sem prometer resultado). Arquivos oficiais copiados para `frontend/public/auralize/`.
- Links com `utm_source=pysqa`; sem rastreadores nem scripts de terceiros; etiqueta "Da equipe Auralize"; botão de fechar, lembrado no navegador (`localStorage`), e o chip reabre.
- Vídeo: "Auralize Salas #1 · Criando um projeto", do canal da Auralize no YouTube (`cP-ZDtmdS1w`). O card mostra um quadro da marca com o botão de tocar; o player (`youtube-nocookie.com`) só é carregado quando o usuário clica, dentro de um `<dialog>`; nenhuma requisição ao YouTube antes disso. Sem autoplay na página.
- Demonstração "Ouça a diferença": o áudio do usuário em duas salas sintéticas (sem e com tratamento), pela rota `/preview` com `environment.synth` (sala de uso único, não guardada; não entra no limite de 4 respostas). Diz que é uma simulação do PySQA, não um resultado do Auralize Salas.
- Testes: `test_aural.py` com 115 verificações (4 novas, da sala de uso único). Verificado no navegador: card, demonstração A/B, fechar e reabrir, janela do vídeo (com arquivo de teste vazio, removido depois).
- Pendente: nada. Se quiser uma capa com imagem do vídeo, é preciso baixar a miniatura do YouTube (não foi feito, para o card não pedir nada ao YouTube antes do clique).

### Bloco Fone: feito (2026-10-23)
- Backend: `headphone.py` (leitura de CSV/TXT com cabeçalho opcional, vírgula, ponto e vírgula com vírgula decimal ou tabulação; coluna `raw`, depois `smoothed`, depois a segunda; correção em dB: compensar = `mín(−M, reforço máximo)` com M suavizada em 1/6 de oitava e média 0 dB entre 200 Hz e 4 kHz, ou simular = M; fade nas pontas; filtro FIR de fase mínima de 2048 amostras pelo cepstro). Passo `HeadphoneStep` na cadeia, aplicado por último (depois da sala, da HRTF e do ruído). Rotas: `POST /assets` com `kind=headphone` e `POST /headphone/response` (curva medida, correção, filtro real e resultado, para o gráfico).
- Frontend: `HeadphoneSection` (modo, CSV, reforço máximo, gráfico `HeadphonePlot`); o bloco 5 da cadeia ficou ativo; a lista de bases livres mostra também o AutoEq.
- Documentação: seção "Fone de ouvido" (PT e EN), equação 8, aviso de que vale para o fone medido, tabela de origem das medições (AutoEq: código MIT, dados por fonte, a confirmar; nada é embutido).
- Testes: `test_aural.py` com 149 verificações (leitores de CSV, achatamento do resultado dentro de 1 dB de 100 Hz a 10 kHz, nível médio, limite de reforço, fase mínima, taxas de 16, 44,1 e 96 kHz, cadeia e API).
- Verificado no navegador: CSV de um fone sintético, gráfico (medido, filtro e resultado), render com compensação (pico −8,1 dBFS).

### Ainda não feito
- Nível absoluto (dB SPL alvo); medições de fone embutidas (dependem da licença de cada fonte); correção por orelha (CSV com canais esquerdo e direito); ruído de cabine gravado.

### Nível em dB SPL: feito (2026-10-23)
- Backend: `level.py` (nível digital = 10·log10(⟨x²⟩/½), em dB re o RMS de um seno em escala máxima; as duas orelhas somadas em energia; ponderação A pela resposta exata da IEC 61672-1, já existente em `processing/filtering.py`, ou Z; SPL de uma gravação calibrada a partir de `calibration_pa`). Passo `LevelStep` na cadeia, aplicado por último: ganho = alvo − L_FS − nível digital, em que L_FS é o nível, no ouvido, de um seno em escala máxima no equipamento do usuário (informado por ele). Modos: sem ajuste, nível-alvo e "manter o nível da gravação" (exige a calibração mV/Pa do áudio de origem). `render` devolve `gain_db` e `level_db_spl`; `preview` devolve o ganho no cabeçalho `X-Gain-Db`.
- Frontend: `LevelSection` (modo, L_FS, ponderação, alvo de 20 a 110 dB, ganho da prévia, avisos); bloco 6 da cadeia.
- Documentação: seção "Nível de reprodução (dB SPL)" (PT e EN), equações 9 e 10, aviso de que L_FS é uma suposição do usuário se não for medido.
- Testes: `test_aural.py` com 171 verificações (seno em escala máxima = 0 dB, A em 1 kHz, 100 Hz (−19,1) e 10 kHz (−2,5), média de energia das orelhas, fórmula do ganho, SPL calibrado = 97 dB, cadeia, pico acima de 0 dBFS, erros e API com calibração).
- Verificado no navegador: tom calibrado de 103 dB SPL (50 mV/Pa) em equipamento de 100 dB: ganho de +17,1 dB e aviso de pico acima de 0 dBFS.
- A prévia calcula o ganho só sobre os primeiros 12 s; o arquivo gerado usa o arquivo inteiro.

### Ainda não feito
- Correção por orelha (CSV esquerdo e direito); constantes de tempo (Fast/Slow); medições embutidas de fone e de salas (dependem de licença); ruído gravado de cabine.

### Cartões da cadeia como navegação: feito (2026-10-23)
- A página tinha informação demais (seis seções empilhadas). Os cartões da cadeia (Ambiente, HRTF, Ruído, Fone, Nível) viraram abas (`role="tablist"`): cada um mostra o resumo do que foi feito (arquivo, modo, valor) e um sinal de "ativo"; ao clicar, abre só os ajustes daquela etapa (`step` em `useAuralStore`). Teclado: setas, Home e End. O cartão da Fonte é só um resumo, sem navegação (a fonte é escolhida na coluna da esquerda). Cenários rápidos, prévia A/B e "Gerar arquivo" continuam sempre visíveis; o chip "Construir minha sala" abre a aba Ambiente, onde está o card do Auralize Salas.
- Verificado no navegador: clique em HRTF, seta para a direita (Ruído), chip "Construir minha sala" (volta ao Ambiente com o card).

### Curvas do ruído e catálogo de curvas de fones (2026-10-23)
- Ruído: rota `POST /noise/spectrum` e gráfico na aba Ruído: níveis em bandas de 1/3 de oitava (0 dB = RMS de um seno em escala máxima) do sinal (já com sala e HRTF) e das três cores de ruído na SNR escolhida; a selecionada é a linha cheia. Testes: inclinação das bandas (branco +3, rosa 0, marrom −3 dB por oitava), seno de 1 kHz a 0 dB, soma das bandas, SNR do componente de ruído e a rota. `test_aural.py`: 185 verificações.
- Leitor de CSV do fone aceita também colunas separadas por espaço (formato dos arquivos do SBAF).
- Pesquisa de curvas de fones livres, conferida em 2026-10-23: SBAF (CC BY 4.0, Hz e dB, lido pelo PySQA), COAT (CC BY 4.0, HpTF em SOFA no ouvido de 27 pessoas; o PySQA ainda não lê), OPRA (dados CC BY-SA 4.0, mas são filtros de equalização, não a resposta medida), AutoEq (código MIT; o README não fala da licença das medições; reúne oratory1990, crinacle, InnerFidelity, Rtings e headphone.com legado, e curvas-alvo como a Harman), squig.link e RTINGS (sem download em lote nem termos achados). Nada foi embutido; entradas no `catalog.json`, na lista do final da página e na tabela da documentação.

### Biblioteca de fones embutida (SBAF): feito (2026-10-23)
- Escolha do usuário: embutir os 99 modelos (viraram 100 ao tratar dois arquivos sem hífen antes do canal) do SBAF, com atribuição. Baixados do commit `7b33e41be47ccb57a59e1a88c48b367eb7329494` (master, último push em 2021-07-21; 227 arquivos de texto, 2,3 MB, mais o README) para uma pasta isolada; os 227 passaram no leitor do PySQA (696 pontos, 20 Hz a 20 kHz). Copiados sem alteração para `backend/data/headphones/sbaf/`, com `NOTICE.txt` (fonte, commit, data, licença, atribuição), `SOURCE_README.md` e `index.json` (gerado por `dev-tests/build_headphone_library.py`).
- Backend: `library.py` (índice, leitura com cache, média dos canais L e R em dB), `assets.get_headphone` resolve ids `lib:...`, rota `GET /headphones/library`.
- Frontend: no bloco Fone, campo de filtro e lista com "Seus arquivos" e "Biblioteca SBAF"; mostra o acoplador, a atribuição e o link da fonte; o cartão da cadeia mostra o nome do fone.
- Cuidados na documentação e na tela: as medições já vêm compensadas pela curva SBAF (não são brutas nem a Harman); quase todos os modelos são hi-fi; três tipos de acoplador (91 entradas de placa plana, 31 de miniDSP EARS); 17 entradas só com um canal; a licença CC BY 4.0 está no README (o GitHub não mostra LICENSE); fonte sem atualização desde 2021.
- Testes: `test_aural.py` com 199 verificações (122 entradas, 227 arquivos, todos carregam, média dos canais, ids inválidos e tentativa de sair da pasta, aviso de licença e commit, rotas).

### Menos informação na página (2026-10-23)
- "Ouvir e comparar" e "Gerar o arquivo" viraram um só painel, "Ouvir e gerar o arquivo", com dois subtítulos. Uma faixa em degradê (verde-água para azul-claro) no topo marca o que fica sempre na tela em qualquer etapa: o cartão da Fonte, os cartões das etapas e esse painel. A linha de dica sob os cartões explica a faixa.
- O quadro "Onde achar HRTFs e respostas de sala de uso livre" foi removido da página (as fontes continuam na documentação, nas referências e em `catalog.json`); chaves de texto `aur.open.*` apagadas.

### Capa do vídeo (2026-10-23)
- A capa oficial do vídeo ("Auralize Salas · Passo 01 · Criando um projeto", 1280×720, 79 KB) foi baixada uma vez de `i.ytimg.com/vi/cP-ZDtmdS1w/maxresdefault.jpg` e guardada em `frontend/public/auralize/auralize-salas-video-capa.jpg`. O card a mostra a partir do próprio site: continua sem nenhuma requisição ao YouTube antes do clique. A capa já traz o botão de tocar e o título, então o card não sobrepõe outro. Se o vídeo ou a capa mudarem, é preciso trocar o arquivo.

### Card do Auralize Salas sem a demonstração (2026-10-23)
- O quadro "Ouça a diferença" (duas salas sintéticas com o áudio do usuário) foi removido do card; o código e os textos dele saíram do frontend. O card ficou com o texto e os botões à esquerda e o vídeo à direita, alinhados ao centro na mesma linha. A rota `/preview` ainda aceita `environment.synth` (sala de uso único, com testes); só não há mais tela que a use.

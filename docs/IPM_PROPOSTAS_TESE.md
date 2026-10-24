# IPM (MPI): o que a tese define, o que o código faz e o que propor

> **Status (out/2026):** a IPM foi reescrita seguindo a tese (`backend/psychoacoustics/mpi.py`: 53 filtros ECMA-418-2, LDI/OR medidos no início do evento, porta contra ruído estacionário). Este relatório descreve a versão anterior, mantida em `mpi_legacy.py`. Ainda provisórios: o valor global (soma de energia), o −6 dB e a leitura da taxa de subida. SIL (Eq. 32) não foi alterado.

Fonte: SILVEIRA, H. A. da. *Qualidade sonora aplicada na análise de sinais impulsivos de refrigeradores*. Tese (Doutorado em Engenharia
Mecânica), UFSC, 2024. Páginas citadas são as impressas (Capítulos 2, 6 e 7). Código: `backend/psychoacoustics/mpi.py` e o `SIL` do painel
de lote. Este documento só compara e propõe: **nada foi alterado no cálculo.** Complementa `docs/IPM_AUDITORIA.md`.

Duas ressalvas. (1) Tenho a tese, não o código original (MATLAB ou Python) nem os áudios dela, então não consigo reproduzir as tabelas de
ponta a ponta; o que está marcado "verificado" foi conferido com os números impressos. (2) Onde digo "hipótese", é leitura minha de um
gráfico ou de uma tabela e precisa da sua confirmação.

> **Valor global (out/2026):** passou a ser a soma de amplitudes das bandas com evento, 20·log₁₀(Σ 10^(MPI/20)), 0 se não há evento (proposta nossa; reproduz o 32,5 dB da Fig. 68, mas não a escala da Tabela 41). O SIL do lote usa esse global com o coeficiente 0,13 ajustado na escala da tese; por isso o termo do IPM no SIL continua não comparável ao da tese.

## 1. O que bate

| Item | Tese | Código | Verificação |
|---|---|---|---|
| P em função do LDI | Tab. 23 (p. 99) e Tab. 30 (p. 116): 12 valores | `5·log10(LDI) − 3·log10(3)` | Diferença máxima 0,007 dB |
| Ponderação de impulso | Tab. 24 (p. 101), 250 a 8000 Hz | Curva do JND em 21 bandas | Diferença máxima 0,044 dB |
| Comportamento qualitativo | Fig. 69, 70 e 89: patamar de −2,9 dB (banda sem evento) e ruído estacionário perto de 4 a 4,8 nas altas | Mesmo comportamento (medido) | Sugere que o código descende da mesma implementação |

## 2. Onde o código se afasta da tese

| # | Ponto | Tese | Código |
|---|---|---|---|
| 1 | **Banco de filtros** (p. 96 a 98) | Filtros auditivos da ECMA-418-2: 53 bandas de 0,5 a 26,5 Bark, 50% de sobreposição, saída complexa (a envoltória é o módulo). | 21 Butterworth de 1/3 de oitava (100 Hz a 10 kHz) sobre a forma de onda, `sosfiltfilt`. |
| 2 | **LDI e OR** (Eq. 2, Fig. 3, Tab. 1, p. 13 a 15; Fig. 65 e 66) | Segundo a Eq. 2, a Fig. 3 e a Tab. 1: OR é a inclinação da subida do nível (dB/s) e LDI a diferença entre o pico e o nível de fundo antes do início, medidos no histórico de nível (a tese não dá a fórmula por banda crítica). | `LDI = L_max − média(20·log10 |x|)` em ±100 ms de amostras instantâneas; `OR = LDI/3`, constante. |
| 3 | **OR constante nas tabelas do MPI** | Tab. 23 e 30: OR/LDI vale 33,33 em *todas* as 12 linhas, isto é, o início é sempre 30 ms. Na Tab. 1 (NT ACOU 112, medido) vale 14,3, 33,3 e 33,3. | O código reproduz o mesmo número, mas sem medir nada. |
| 4 | **Deslocamento de 6 dB** | Tab. 1: `P = 3·lg(OR) + 2·lg(LDI)`. Tab. 23 e 30: `P = 3·lg(OR) + 2·lg(LDI) − 6` (confere nas 12 linhas). | `OR = LDI/3` embute o −6 sem dizê-lo. A origem do −6 não está na tese. |
| 5 | **Valor global** (p. 102 e Tab. 41, p. 132) | Exemplo da Fig. 68: 32,5 dB. Tab. 41: **16,6 a 77,9 dB** (média 61,3 nos impulsivos, 41,4 nos estacionários). | `10·log10 Σ 10^(MPI/10)`: 12,0 dB para silêncio, 16,8 para ruído, no máximo 19,4 dB com clique 80 dB acima. |
| 6 | **Critério e duração** (p. 116, 117, 134) | "MPI > 5 em alguma banda", em trechos de ~5 s centrados no evento. Sensibilidade 0,89, especificidade 0,86, acurácia 0,87 (n = 24). | O arquivo inteiro, de qualquer duração. |
| 7 | **Eixo Bark** | Bark HMS das 53 bandas (Fig. 68 a 71, ~22 pontos). | Reta de 0,99 a 21,73 em 21 pontos (até 3,5 Bark de erro). |
| 8 | **Modelo de incômodo** (Eq. 32 e 33, p. 158 e 162) | Impulsivo: `−26,86 + 5,44·L + 13,29·S + 7,75·R + 0,13·MPI`. Estacionário: `−25,16 + 7,51·L + 4,63·S + 6,59·R + 0,56·MPI`. | `SIL = −25,95 + 10,24·N + 13,29·S + 7,75·R + 0,13·IPM`: constante e loudness diferentes da Eq. 32, e não há a Eq. 33. |

## 3. O que isso significa na prática

**3.1 O global do app não reproduz o da tese, e o incômodo herda isso.** A tese ajustou `0,13·MPI` (impulsivos) e `0,56·MPI` (estacionários) com
MPI global entre 16 e 78 dB. O app usa um global entre 12 e 19 dB. Para um sinal impulsivo típico da tese (61,3 dB), o termo do MPI dá ~2,2 no app
e ~8,0 no modelo: o app subestima o incômodo em ~5,8 unidades só por esse termo; no modelo estacionário (0,56) a diferença seria de ~14. O que
produz os números da tese não é só a prominência: o global depende também do nível do sinal. Hipótese: a Fig. 68 (valores lidos no gráfico) dá 32,5 dB
exatamente como `20·log10 Σ 10^(MPI/20)` (soma de amplitudes), e a soma de energia dá 19,3 dB; mas isso não explica os 64,6 dB de uma das amostras
estacionárias, que 22 valores de MPI abaixo de 10 dB não alcançariam. Preciso da definição exata.

**3.2 O critério "MPI > 5 em alguma banda" só vale para trechos curtos.** O ruído estacionário tem P ≈ 4,8 por banda e o limiar fica a 0,2 acima. O pico
detectado é o máximo global da banda, que cresce com a duração. Medido (`dev-tests/ipm_noise_study.py`), ruído branco sem nenhum impulso:

| Duração | Registros marcados como impulsivos |
|---|---|
| 5 s | **0%** (a condição da tese) |
| 10 s | 8% |
| 30 s | 20% |
| 60 s | 17% |
| 120 s | 25% |
| 60 s cortados em 12 janelas de 5 s | 3 de 8 registros |

Cortar em janelas não resolve: com mais janelas, mais chances de uma passar de 5.

**3.3 O início do arquivo vira "impulso".** Um tom puro dá P ≈ 7 nas bandas vizinhas, com o pico analisado em t = 0; com rampas de 200 ms cai para ~4,5.
A tese segmentou cada excerto em torno do pico (Fig. 77), o que escondia isso.

**3.4 A IPM não mede o início.** Como OR é constante, `P = 5·log10(LDI) − 1,43`: dois eventos com o mesmo LDI e subidas de 1 ms ou de 100 ms dão o mesmo P.
Foi o que o texto da tese descreve na Fig. 3 e na Tab. 1 (OR medido), mas não o que as Tab. 23 e 30 mostram.

**3.5 Estatística do modelo de incômodo.** Impulsivos: 10 amostras e 5 coeficientes. O MPI tem p = 0,063 e intervalo de confiança de −0,011 a 0,27
(inclui zero), mas o texto da p. 158 o chama de "preditor significativo". Estacionários: o texto da p. 162 diz "p-valor insignificante (0,000)". A correlação de 0,851
da validação (p. 112) vem de 10 amostras, com o MPI entre 36 e 50 dB, e depende dos dois extremos (tiro e batida de porta).

## 4. Propostas, em ordem

**Fase 0: dados e critérios de aceitação (sem isso, o resto é palpite)**

1. Obter a implementação original da tese e os áudios dos exemplos (cracking noise filtrado em 125 e 1000 Hz, as 10 amostras da Tab. 25, as 24 da Tab. 41).
2. Transformar em testes de aceitação: Tab. 23 (P = 4,65 e 6,90), Tab. 24, Tab. 25, Tab. 30, Tab. 41 e a matriz de confusão da Tab. 44. Os números já
   impressos estão em `dev-tests/test_ipm.py`, seção 8.

**Fase 1: honestidade na interface (sem mudar valores)**

3. Rotular o global do app como "IPM global (soma de energia)" e dizer, no SIL, que ele usa uma variante que não é a Eq. 32 e que o global difere do da tese,
   até a Fase 3 terminar. Marcar o SIL como experimental.
4. Corrigir o eixo e o rótulo do Bark (Bark real das frequências centrais) e diferenciar "banda sem evento" (0) de P negativo.
5. Avisar quando o arquivo passa de ~5 s (a validação foi em 5 s) e quando começa ou termina abruptamente.

**Fase 2: reproduzir o método da tese**

6. **Banco de filtros ECMA-418-2 e envoltória.** O módulo `backend/psychoacoustics/ecma_fast/tonality_exact.py` já traz `_filterbank()` com os 53 filtros
   auditivos; a envoltória é o módulo da saída complexa. Eixo em Bark HMS (`F(z) = (Δf0/c)·sinh(c·z)`).
7. **LDI e OR como na NT ACOU 112**: histórico de nível por banda (passo de 10 ms, como sugerem os múltiplos de 10 ms da Tab. 1), início do evento, pico, OR pela
   inclinação e LDI pelo nível de fundo anterior. Se o OR de 30 ms for intencional, documentá-lo e simplificar para `P = 5·log10(LDI) − 1,43`.
8. **Unidade de análise**: detectar os eventos no arquivo e calcular o MPI em um excerto de ~5 s em torno de cada pico (como a tese), reportando o evento mais
   proeminente e a lista dos demais, em vez do máximo do arquivo.

**Fase 3: global e incômodo**

9. Definir o global a partir da tese (pergunta 1 abaixo), implementar e conferir com a Tab. 41 antes de tocar no SIL.
10. Implementar as Eq. 32 e 33 como modelos nomeados (impulsivo e estacionário), com a fonte e o n do ajuste visíveis; decidir se `−25,95 / 10,24` vem de um reajuste posterior.

**Fase 4: robustez do detector**

11. Proteger as bordas (ignorar picos dentro do tempo de assentamento dos filtros ou aplicar fade curto) como opção desligada por padrão, para avaliar o efeito.
12. Detector consciente de ruído estacionário: comparar a prominência com a esperada para ruído gaussiano na duração do excerto (pico/σ), de modo que ruído devolva "sem evento"
    e o limiar de 5 ganhe margem.
13. Piso definido para o nível em silêncio digital e tratamento de NaN (este já feito).

**Fase 5: validação estatística**

14. Validação cruzada (leave-one-out) e erro de predição dos modelos de incômodo; intervalos de confiança; mais amostras. Cuidar para o texto não chamar de significativo o que não é.

## 5. Perguntas que só você pode responder

1. Qual é a fórmula exata do **MPI global** (Tab. 41)? Ela depende do nível do sinal?
2. De onde vêm o **−6 dB** e o **início de 30 ms** da Tab. 23 e 30? É uma escolha, um valor da NT ACOU 112 ou um deslize?
3. Como o **LDI** é medido no MPI: nível de fundo antes do início, e em que janela? O OR vem da envoltória ou é definido?
4. O app deve usar a **Eq. 32** da tese ou os coeficientes `−25,95 / 10,24` (reajuste do artigo de 2026)? Onde está a versão certa?
5. Qual **loudness, sharpness e roughness** entraram no ajuste (modelos e normas)? O app usa ISO 532-1, DIN 45692 e Daniel e Weber.
6. A tese plota ~22 pontos de 1 a ~22 Bark. Foram 21, 22 ou as 53 bandas?
7. Você pode compartilhar o código original e os áudios dos exemplos?

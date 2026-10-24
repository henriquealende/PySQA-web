# Auditoria da IPM (Impulsive Prominence Metric)

Código auditado: `backend/psychoacoustics/mpi.py` (calculadora) e `_metric_ipm` em `backend/services/audio_service.py` (o que o
servidor devolve). Testes: `dev-tests/test_ipm.py` (`python ../dev-tests/test_ipm.py`, na pasta `backend`, 31 s).

**Nada no cálculo da métrica foi alterado.** Os testes descrevem o comportamento de hoje: o que deve valer (PASS) e as limitações
encontradas (KNOWN ISSUE), que passam a FIXED quando uma correção as elimina. O que está dito aqui sobre a *intenção* da métrica
precisa ser confirmado com a tese e os artigos, que não fazem parte do repositório.

## Como a IPM funciona hoje

1. 21 filtros passa-faixa de 1/3 de oitava (100 Hz a 10 kHz), Butterworth de 6ª ordem aplicados com `sosfiltfilt` (fase zero).
2. Em cada banda, `find_peaks` sobre a forma de onda com prominência mínima de 5 desvios-padrão da banda; fica o pico positivo mais alto.
3. Janela de 200 ms em torno dele. Nível `20·log10(|x|/20 µPa)` de cada amostra; `LDI = L_max − L_média`.
4. `P = 3·log10(OR) + 2·log10(LDI)`, com `OR = LDI / (15 · 0,2 s)`.
5. `IPM_banda = P + ponderação` (curva derivada de limiares de diferença perceptível, de 0 a −2,9 dB).
6. O servidor devolve os 21 valores e o global `10·log10(Σ 10^(IPM/10))`, com linha de limiar em 5.

## Achados

Severidade: **A** muda a interpretação do resultado, **M** merece decisão do autor, **B** robustez e manutenção.

| # | Sev. | Achado | Evidência (medida) |
|---|---|---|---|
| 1 | A | **O ruído estacionário passa no detector em todas as bandas.** O pico mais alto de qualquer sinal de banda tem prominência grande em relação ao próprio sinal, então o ramo "sem evento" quase nunca é usado. | Ruído branco: evento detectado em 99,4% a 100% das bandas, de 1 a 16 s. |
| 2 | A | **A métrica tem piso e faixa pequenos.** Ruído estacionário dá P ≈ 4,8 por banda e global ≈ 16,8 dB (silêncio digital: 12,0 dB). Um clique 20 dB acima do ruído não aparece (+0,07 dB no global) e um 80 dB acima sobe só +2,6 dB. | `5·log10` de uma diferença de dB comprime a escala. Faixa útil do global: ~16,8 a ~19,4 dB. |
| 3 | A | **O início ou o fim brusco do arquivo é lido como impulso.** Tom puro ou zumbido estacionário vira "impulsivo" nas bandas vizinhas. | Tom de 1 kHz: P ≈ 7,0 a 7,3 nas bandas vizinhas, com pico analisado em t = 0,001 s; com rampas de 200 ms, P ≈ 4,4 a 4,5. Zumbido de 50 Hz com ruído: 7 bandas acima de 5 (1 com rampas). |
| 4 | M | **O termo de taxa de início (OR) não carrega informação de tempo.** Com `T = 0,2 s` fixo, `OR = LDI/3` e `P = 5·log10(LDI) − 3·log10(3)` exatamente. | Verificado a 1e-12. Se nos artigos o OR usa o tempo de subida medido, esse termo se perdeu. |
| 5 | M | **O limiar de 5 fica colado ao piso do ruído, e o piso sobe com a duração.** P do ruído: 4,67 (0,5 s), 4,81 (2 s), 4,89 (8 s), 4,97 (16 a 32 s). | Com a ponderação, ruído de até 4 s não passa de 5, mas 10% dos registros de 16 s têm alguma banda acima de 5. Sem ponderação, 71% dos registros de 2 s têm banda acima de 5. |
| 6 | M | **Eixo Bark errado no gráfico.** `BARK_SCALE` é uma reta entre 0,9867 e 21,7292; o servidor a rotula "Bark HMS". | A 500 Hz o eixo diz 8,25 e o Bark de Zwicker é 4,74 (erro de até 3,5 Bark; 2,9 contra a escala HMS). Só afeta o eixo, não os valores. |
| 7 | M | **O global soma P (adimensional) como se fosse nível em dB.** Sem eventos, a soma das ponderações já dá 12,0 dB. | No modelo de incômodo, `0,13·IPM` varia só ±0,34 ao longo de toda a faixa útil do global, contra 10,24 por sone, 13,29 por acum e 7,75 por asper. Conferir com o ajuste da tese. |
| 8 | B | Ponderação lida em índices de uma grade de 5,04 Hz que ficam até 4,2% acima das frequências centrais (a docstring diz "1 Hz"). | Diferença de até 0,053 dB por banda. Aparenta índice de MATLAB (base 1) levado ao Python. |
| 9 | B | Erros pouco claros: arquivo com menos de 40 amostras e arquivos de 16 ou 22,05 kHz (a banda de 10 kHz passa de Nyquist) dão "Digital filter critical frequencies must be 0 < Wn < 1". | O servidor devolve essa frase crua. |
| 10 | B | **NaN dentro do arquivo vira um resultado de aparência normal** (vetor "sem evento", global 12,0 dB) em vez de erro. | Verificado. |
| 11 | B | **Memória: 21 vezes a duração do arquivo em `float64`** (8 MB por segundo a 48 kHz, 92 MB para 10 s). | Filtrar, medir e descartar uma banda por vez dá os mesmos números bit a bit com 15 MB. |
| 12 | B | Nomes inconsistentes: "Impulsive Prominence Metric", "Impulse Prominence Metric", "Impulsiveness / Modulation Prominence Index", MPI e IPM. `plot_weighting` repete o cálculo da curva. | |

Robustez comprovada (PASS): ganho (×1000 e ×0,001) muda P em menos de 1e-9; polaridade invertida, no máximo 0,16; posição do clique
no arquivo, 0,13 dB no global; 44,1, 48 e 96 kHz concordam em 0,04 dB; um segundo clique 50 ms depois não altera o global;
DC não importa; entrada vazia, estéreo, `int16` e lista funcionam; chamadas repetidas dão o mesmo resultado.

## Sugestões, em ordem

**Sem mudar nenhum número da métrica**

1. **Processar banda a banda** (achado 11): reduz a memória de 92 para 15 MB em 10 s, de 9,5 para algo como 2 MB por segundo (a medir
   no Render). O limite do site para a IPM subiria de ~150 s para o arquivo inteiro (240 s). O teste `streaming gives bit-identical
   prominences` já valida a troca; o esboço está em `prom_stream` no teste.
2. **Erros e entradas inválidas** (achados 9 e 10): mensagem própria para arquivo curto demais; bandas acima de Nyquist devolvidas como
   ausentes com aviso, em vez de derrubar a métrica; recusar NaN e infinito com mensagem.
3. **Arrumar a casa** (achado 12): um nome só, docstring correta (5,04 Hz), uma função para a curva de ponderação, filtros em cache por taxa.
4. **Eixo Bark** (achado 6): usar o Bark real das frequências centrais (a escala HMS, como as outras métricas ECMA do PySQA) ou uma
   escala em Hz; só muda o eixo.

**Mudam valores: decidir com os dados da tese**

5. **Ponderação nas frequências exatas** (achado 8): `np.interp(CENTRE_FREQUENCIES, ...)` elimina a tabela de índices; muda até 0,05 dB.
   Decidir se vale perder a identidade numérica com os valores publicados.
6. **Proteção contra as bordas** (achado 3): ignorar picos dentro do tempo de assentamento do filtro nas pontas, ou aplicar um
   fade curto antes de filtrar. Oferecer como opção desligada por padrão (`edge_guard_s = 0`) para estudar o efeito sem mexer nos
   números existentes.
7. **Taxa de início real** (achado 4): se a definição dos artigos usa o tempo de subida medido (de L_média a L_max, por exemplo), o
   código deveria medi-lo; senão, documentar que o termo é constante.
8. **Detector consciente de estacionariedade** (achados 1, 2 e 5): por exemplo, comparar a prominência com a esperada para ruído
   gaussiano (pico/σ) ou detectar sobre o envelope; assim o ruído estacionário devolveria 0 ou um piso definido, e o limiar de 5 teria
   margem. É questão de pesquisa: exige reajustar e revalidar contra os julgamentos subjetivos.

**Validação (a mais importante)**

9. **Vetores de referência da implementação original** (MATLAB ou a versão da tese): os testes de hoje só garantem que o código não
   mudou, não que ele coincide com a tese. Dois ou três sinais com os valores esperados por banda fechariam isso. Também vale incluir
   alguns arquivos reais de refrigerador (o teste aceita um WAV no estilo de `PYSQA_BENCH_WAV`).
10. **Conferir o global e o modelo de incômodo** (achado 7): se na tese o IPM do ajuste tinha outra escala ou faixa, esta
    implementação não reproduz o modelo SIL.

## O que ficou como está

Contrato da API, valores, gráfico e documentação continuam iguais. O vetor "golden" do teste (`GOLDEN_P`) foi gerado com o código
de hoje: se uma das mudanças das sugestões 5 a 8 for adotada, ele deve ser regerado de propósito.

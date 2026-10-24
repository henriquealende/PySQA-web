import { Bibliography, Callout, Cite, Eq, Figure, K, P, Section, Table, UL } from './ui'
import {
  BarkDemo, EnvelopeChart, FilterDemo, FluctuationChart, LoudnessChart, OctaveChart, RoughnessChart, SharpnessChart,
  SpectrogramChart, SpectrumChart, TonalityChart, WeightingDemo, WindowDemo,
} from './demos'

export default function PostProcessingDoc() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Post-Processing</h1>
        <P>
          O Post-Processing é a página onde você abre gravações em WAV e as examina: forma de onda, espectro, espectrograma,
          bandas de 1/3 de oitava, envelope e as métricas de qualidade sonora (loudness, sharpness, roughness, fluctuation
          strength, tonalidade e impulsividade). Aqui você também filtra, aplica janelas e ponderações, e compara vários arquivos
          de uma só vez.
        </P>
        <Callout kind="tip" title="Como ler esta página">
          Cada recurso tem três partes: <strong>o que é</strong> (em linguagem simples), <strong>como o PySQA calcula</strong> e
          <strong> o que observar ao interpretar</strong>. Os gráficos interativos foram calculados com o próprio PySQA, e as
          referências estão no formato ABNT ao final.
        </Callout>
      </header>

      {/* ── 1 ── */}
      <Section id="visao-geral" title="Visão geral">
        <P>O fluxo típico de trabalho tem cinco passos:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Importar:</strong> arraste arquivos WAV para a área de importação ou clique para escolher. É possível enviar vários de uma vez.</li>
          <li><strong>Escolher a vista:</strong> Normal (forma de onda + espectro), Espectrograma, 1/3 de oitava ou Envelope. Para uma métrica psicoacústica, escolha-a em <K>Métrica</K>.</li>
          <li><strong>Processar (opcional):</strong> o botão de edição de cada arquivo abre filtros, janelas, ponderações e ajuste de loudness. O resultado vira um <em>novo arquivo</em>; o original nunca é alterado.</li>
          <li><strong>Comparar e analisar em lote:</strong> sobreponha um segundo arquivo (<K>Comparar com</K>) ou use <K>Lote</K> para calcular várias métricas em vários arquivos.</li>
          <li><strong>Exportar:</strong> WAV, planilha (XLSX) ou tabela (CSV).</li>
        </ol>
        <Callout kind="info" title="Um canal por vez">
          Em arquivos estéreo, a forma de onda, o espectro, o 1/3 de oitava e o envelope mostram os <strong>dois canais</strong> (nos gráficos de tempo, esquerdo em verde e direito em violeta; nos de frequência, esquerdo em laranja e direito em azul), e o espectrograma tem uma chave <strong>L / R</strong>. As <strong>métricas</strong> usam só o <strong>canal esquerdo</strong>: calcular os dois dobraria o tempo de processamento, e a tela avisa quando isso vale. Para obter métricas do canal direito, separe-o antes em um arquivo mono.
        </Callout>
      </Section>

      {/* ── 2 ── */}
      <Section id="mapa" title="Mapa de recursos">
        <P>A tabela resume tudo o que a página oferece. Os nomes em inglês são os mesmos que aparecem nos botões.</P>
        <Table
          head={['Recurso', 'O que faz', 'Parâmetros principais']}
          widths={['22%', '48%', '30%']}
          rows={[
            ['Forma de onda', 'Forma de onda no tempo, com pico do arquivo e aviso de saturação', 'Seleção de trecho; calibração'],
            ['Espectro', 'Espectro de frequência do trecho (FFT)', 'Janela de Hanning; eixo logarítmico'],
            ['Espectrograma', 'Como o espectro muda no tempo', 'NFFT, sobreposição, janela, mapa de cores, escala, fmáx., faixa dinâmica'],
            ['1/3 de oitava', 'Nível por banda de 1/3 de oitava (31 bandas)', 'Ponderação Z (nenhuma) ou A'],
            ['Envelope', 'Contorno de amplitude do sinal e seu espectro', 'Suavização (ms), filtro passa-baixa (Hz)'],
            ['Comparar com', 'Sobrepõe um segundo arquivo ao primeiro', 'Qualquer arquivo carregado'],
            ['Filtragem', 'Passa-baixa, passa-alta, passa-banda, rejeita-banda, equalizador de 1/3 de oitava, entalhe harmônico', 'Frequências de corte, ordem, Q, ganhos'],
            ['Janelamento', 'Multiplica um trecho por uma janela (Retangular, Hanning, Hamming, Blackman, Bartlett, Kaiser)', 'Início, fim, tipo'],
            ['Ponderação', 'Ponderação em frequência A ou C', 'Curva'],
            ['Ajuste de loudness', 'Ajusta o nível de um arquivo para igualar a loudness de outro', 'Arquivo de referência'],
            ['Métricas', 'Loudness (ISO 532-1 e ECMA-418-2), sharpness, roughness (D&W e ECMA), fluctuation strength, tonalidade, IPM', 'Campo livre ou difuso'],
            ['Calibração do microfone', 'Converte o sinal digital em pascais (dB SPL)', 'Sensibilidade em mV/Pa'],
            ['Lote', 'Várias métricas em vários arquivos, mais modelos de incômodo (SIL e ZWK)', 'Arquivos, métricas, trechos'],
            ['Exportar', 'WAV, XLSX e CSV', 'Tabela escolhida'],
          ]}
        />
      </Section>

      {/* ── 3 ── */}
      <Section id="niveis" title="Níveis, unidades e calibração">
        <P>
          Um arquivo WAV guarda números entre −1 e +1, não pressões sonoras. Sem uma calibração, o PySQA só consegue falar em
          <strong> dBFS</strong> (decibéis em relação ao fundo de escala). Com a sensibilidade do microfone, os números viram
          pascais e os níveis passam a ser <strong>dB SPL</strong>, em relação a 20 µPa <Cite ids={['iso1683']} />.
        </P>
        <Eq n={1} where={<>onde p<sub>rms</sub> é a pressão sonora eficaz (RMS), em pascais, e p<sub>0</sub> = 20 µPa.</>}>
          L = 20 · log₁₀( p<sub>rms</sub> / p<sub>0</sub> )
        </Eq>
        <P>
          Na barra lateral, <K>Calibração do microfone</K> recebe a sensibilidade em mV/Pa. O PySQA assume 1 V no fundo de escala e calcula
          a pressão que corresponde a ele:
        </P>
        <Eq n={2} where={<>Exemplo: um microfone de 50 mV/Pa dá 1000/50 = 20 Pa no fundo de escala; um tom de amplitude máxima vale então cerca de 117 dB SPL (RMS).</>}>
          p<sub>FS</sub> [Pa] = 1000 / sensibilidade [mV/Pa]
        </Eq>
        <Callout kind="warn" title="Sem calibração, as métricas não têm valor absoluto">
          As métricas psicoacústicas dependem do nível real do som. Quando o arquivo não está calibrado, o PySQA assume que o fundo de
          escala vale 1 Pa (um tom de amplitude máxima seria ≈ 91 dB SPL). Os números servem para <em>comparar</em> arquivos gravados
          do mesmo jeito, mas não são valores absolutos. Para calibrar, use um calibrador acústico <Cite ids={['iec60942']} /> na
          página Data Acquisition e leve a gravação já calibrada ao Post-Processing, ou digite a sensibilidade do microfone.
        </Callout>
        <P>
          Em dBFS, o <strong>espectro</strong> usa o valor de pico (0 dBFS é um tom de amplitude máxima) e as <strong>bandas de 1/3 de
          oitava</strong> usam o valor eficaz (um tom de amplitude máxima mede −3 dBFS). Em dB SPL, as duas telas usam o valor eficaz.
        </P>
      </Section>

      {/* ── 4 ── */}
      <Section id="trecho" title="Seleção de trecho">
        <P>
          Muitas vezes só uma parte da gravação interessa: um ruído de partida, um evento, um trecho estável. Na vista Normal,
          arraste sobre a forma de onda (ou digite os limites na barra <K>Trecho</K>) para escolher o trecho. Todas as vistas, as
          métricas e o lote passam a usar apenas esse trecho, e os eixos de tempo continuam mostrando o tempo original do arquivo.
        </P>
        <Callout kind="tip">Calcular só o trecho de interesse também reduz muito o tempo e a memória, principalmente nas métricas ECMA-418-2.</Callout>
      </Section>

      {/* ── 5 ── */}
      <Section id="visualizacoes" title="Visualizações">
        <Section id="v-onda" title="Forma de onda" level={3}>
          <P>
            Mostra a amplitude ao longo do tempo (em fundo de escala, ou em pascais se o arquivo estiver calibrado). Para arquivos
            longos, o PySQA desenha no máximo 8 000 pontos, mas guarda o <em>máximo e o mínimo</em> de cada trecho, de modo que picos
            curtos e saturação nunca desaparecem do desenho. O pico do arquivo inteiro aparece abaixo do gráfico.
          </P>
        </Section>

        <Section id="v-espectro" title="Espectro" level={3}>
          <P>
            O espectro mostra <em>quanta energia há em cada frequência</em>. O PySQA aplica a janela de Hanning ao trecho inteiro,
            calcula a transformada rápida de Fourier (FFT) e corrige o ganho da janela, de forma que um tom de 94 dB SPL apareça com 94 dB
            no pico (nível eficaz por linha). A resolução em frequência é Δf = fs / N: quanto mais longo o trecho, mais fino o espectro.
          </P>
          <Figure n={1} title="Espectro de dois tons (1 kHz a 94 dB e 3 kHz a 74 dB) em ruído fraco. Os picos leem os níveis verdadeiros."
            note="Sinal sintético de 4 s, calibrado. Para um tom entre duas linhas da FFT, a janela de Hanning pode subestimar o pico em até cerca de 1,4 dB.">
            <SpectrumChart />
          </Figure>
          <P>
            Para desenhar rápido, o espectro é reduzido a 2 400 pontos em eixo logarítmico: cada ponto guarda o <em>pico</em> da sua
            faixa (nenhum tom desaparece). Em arquivos estéreo há uma curva por canal, esquerdo e direito. O desenho segue a ideia da análise espectral por
            janelas descrita por Harris <Cite ids={['harris1978']} />.
          </P>
        </Section>

        <Section id="v-espectrograma" title="Espectrograma" level={3}>
          <P>
            O espectrograma divide o sinal em blocos curtos e calcula o espectro de cada um; o resultado é uma imagem em que o eixo
            horizontal é o tempo, o vertical é a frequência e a cor é o nível. É a ferramenta certa para sons que mudam: acelerações,
            apitos, impactos. O método é a transformada de Fourier de tempo curto <Cite ids={['allen1977']} />.
          </P>
          <Figure n={2} title="Espectrograma de um sinal de varredura (chirp) de 200 Hz a 3,8 kHz: a frequência sobe com o tempo."
            note="NFFT 256, 50 % de sobreposição, janela de Hanning, fs = 8 kHz.">
            <SpectrogramChart />
          </Figure>
          <Table
            head={['Parâmetro', 'Padrão', 'Efeito']}
            widths={['24%', '16%', '60%']}
            rows={[
              ['NFFT', '2048', 'Tamanho do bloco. Maior = frequências mais finas, tempo mais borrado (Δf = fs / NFFT).'],
              ['Overlap', '75 %', 'Quanto um bloco repete do anterior. Mais sobreposição = imagem mais suave, cálculo mais lento.'],
              ['Window', 'Hanning', 'Forma da janela de cada bloco (veja “Janelamento” abaixo).'],
              ['Colormap / Freq. scale', 'magma / log', 'Aparência e eixo de frequência (logarítmico ou linear).'],
              ['Max frequency', '20 kHz', 'Corta o eixo vertical (limitado à frequência de Nyquist).'],
              ['Dynamic range', '90 dB', 'Faixa de dB abaixo do máximo que recebe cor; o que está abaixo vira o piso.'],
            ]}
          />
          <Callout kind="info">
            Há um compromisso inevitável: blocos longos resolvem bem a frequência e mal o tempo; blocos curtos fazem o contrário. A
            imagem mostra o nível relativo (em fundo de escala), não valores calibrados em pascais. Com mais de 400 blocos, o PySQA
            mostra um a cada <em>k</em> para limitar o tamanho dos dados.
          </Callout>
        </Section>

        <Section id="v-oitava" title="Bandas de 1/3 de oitava" level={3}>
          <P>
            O ouvido não distingue frequências isoladas tão bem quanto faixas largas; por isso, em acústica é comum resumir o espectro
            em bandas cuja largura é 1/3 de oitava. O PySQA usa as 31 frequências centrais preferenciais, de 20 Hz a 20 kHz
            <Cite ids={['iso266']} />. Cada banda vai de f<sub>c</sub>/2<sup>1/6</sup> a f<sub>c</sub>·2<sup>1/6</sup>; o sinal passa por um
            filtro passa-banda e o nível é o valor eficaz (RMS) do que sobrou. Bandas acima de 98 % da frequência de Nyquist são omitidas.
          </P>
          <Figure n={3} title="Níveis em 1/3 de oitava de um ruído branco e de um ruído rosa, ambos com 70 dB SPL no total."
            note="O ruído branco tem a mesma energia por hertz, então sobe 3 dB por oitava nas bandas; o rosa tem a mesma energia por oitava e fica plano.">
            <OctaveChart />
          </Figure>
          <Callout kind="warn" title="Não é um analisador de classe 1">
            Os filtros do PySQA são Butterworth de 4ª ordem aplicados nos dois sentidos (veja “Filtros”), e não os filtros normalizados
            da IEC 61260-1 <Cite ids={['iec61260']} />. Os resultados servem muito bem para análise e comparação, mas não substituem
            um analisador certificado quando a norma exige conformidade.
          </Callout>
          <P>
            Em <K>⚙</K> você escolhe a ponderação: <strong>Z</strong> (nenhuma) ou <strong>A</strong> (aplicada antes da divisão em bandas,
            veja “Ponderação em frequência”).
          </P>
        </Section>

        <Section id="v-envelope" title="Envelope" level={3}>
          <P>
            O envelope é o contorno da amplitude: a “capa” do sinal. Ele revela modulações, isto é, variações lentas de volume, que são
            a base de métricas como roughness e fluctuation strength. O PySQA o obtém pelo sinal analítico (transformada de Hilbert): a
            envoltória é o módulo desse sinal complexo <Cite ids={['marple1999']} />.
          </P>
          <Figure n={4} title="Tom de 400 Hz modulado em amplitude a 16 Hz (profundidade de 80 %) e seu envelope."
            note="O envelope sobe e desce 16 vezes por segundo, como a modulação.">
            <EnvelopeChart />
          </Figure>
          <UL>
            <li><strong>Smoothing (ms):</strong> média móvel opcional, para alisar o contorno (0 = desligada).</li>
            <li><strong>LPF (Hz):</strong> filtro passa-baixa opcional de 4ª ordem sobre o envelope, aplicado nos dois sentidos.</li>
            <li>O <strong>espectro do envelope</strong> mostra em que frequências o volume oscila (as frequências de modulação).</li>
          </UL>
        </Section>

        <Section id="v-comparar" title="Comparar com outro arquivo" level={3}>
          <P>
            <K>Comparar com</K> sobrepõe a forma de onda (em azul), o espectro (em amarelo) ou a métrica de um segundo arquivo ao primeiro, usando
            o mesmo trecho. É a maneira mais direta de ver o efeito de um processamento: compare o original com a versão filtrada.
          </P>
        </Section>
      </Section>

      {/* ── 6 ── */}
      <Section id="processamento" title="Processamento">
        <P>
          O botão de edição de cada arquivo abre quatro abas. Todas geram um <strong>novo arquivo</strong> (em ponto flutuante de 32 bits, para
          não saturar) e preservam o original.
        </P>

        <Section id="p-filtros" title="Filtros" level={3}>
          <UL>
            <li><strong>Low-pass / High-pass:</strong> deixam passar o que está abaixo / acima da frequência de corte.</li>
            <li><strong>Band-pass / Band-reject:</strong> deixam passar / eliminam uma faixa entre duas frequências.</li>
            <li><strong>1/3-Octave EQ:</strong> 31 controles de −24 a +24 dB, um por banda. Aplicado diretamente no espectro: cada linha da FFT é multiplicada pelo ganho da banda a que pertence.</li>
            <li><strong>Harmonic Notch:</strong> uma série de filtros muito estreitos (entalhes) na frequência fundamental e em todos os seus harmônicos abaixo da frequência de Nyquist. O fator Q (padrão 30) controla a estreiteza: <em>largura = f / Q</em>. Útil para remover o ruído de rede de 50/60 Hz e seus harmônicos.</li>
          </UL>
          <P>
            Os filtros de corte são do tipo <strong>Butterworth</strong> <Cite ids={['butterworth1930']} />, de ordem 4 por padrão, a resposta mais plana
            possível na banda de passagem. Há também a variante Linkwitz-Riley.
          </P>
          <Callout kind="info" title="Filtro de “ida e volta” (fase zero)">
            O PySQA filtra o sinal para frente e depois para trás <Cite ids={['gustafsson1996']} />. Assim, o filtro não atrasa nem deforma a forma
            de onda no tempo (sem distorção de fase). O preço: a resposta em amplitude é aplicada duas vezes. Na frequência de corte o
            ganho é −6 dB (e não −3 dB, como no filtro de uma passada), e a queda fora da banda é duas vezes mais acentuada. Mova o controle:
          </Callout>
          <Figure n={5} title="Resposta de um filtro passa-baixa Butterworth de 1 kHz: uma passada e ida e volta."
            source="curvas teóricas do filtro analógico equivalente; o filtro digital do PySQA é muito próximo longe da frequência de Nyquist.">
            <FilterDemo />
          </Figure>
        </Section>

        <Section id="p-janelas" title="Janelamento" level={3}>
          <P>
            Uma <strong>janela</strong> é uma curva de pesos entre 0 e 1 que multiplica o trecho de sinal. Ao recortar um pedaço de som, as bordas
            “batem” de repente e criam artefatos no espectro (o chamado vazamento espectral). Janelas que chegam suavemente a zero nas bordas
            reduzem esse efeito <Cite ids={['harris1978']} />. A escolha é sempre um compromisso entre três coisas:
          </P>
          <UL>
            <li><strong>Lóbulo principal estreito</strong>: separa melhor duas frequências próximas.</li>
            <li><strong>Lóbulos laterais baixos</strong>: um tom forte não “contamina” o resto do espectro.</li>
            <li><strong>Ganho coerente alto</strong>: o sinal perde menos energia ao ser janelado.</li>
          </UL>
          <Figure n={6} title="As seis janelas do PySQA (à esquerda, no tempo) e suas respostas em frequência (à direita)."
            source="PySQA (cálculo próprio; janelas de 64 pontos, as mesmas fórmulas do módulo de janelamento)."
            note="O Kaiser usa β = 14, o valor padrão do PySQA. O Retangular não suaviza as bordas, por isso tem o lóbulo mais estreito e o vazamento mais alto.">
            <WindowDemo />
          </Figure>
          <Table
            head={['Janela', 'Quando usar']}
            widths={['22%', '78%']}
            rows={[
              ['Retangular', 'Sinais que já cabem exatamente no trecho (ou transientes que não podem ser suavizados).'],
              ['Hanning', 'Uso geral; é a janela do espectro e do espectrograma. Bom equilíbrio entre resolução e vazamento.'],
              ['Hamming', 'Parecida com a Hanning, com o primeiro lóbulo lateral mais baixo, mas que decai devagar.'],
              ['Blackman', 'Quando há tons fortes e fracos próximos e o vazamento precisa ser baixo.'],
              ['Bartlett', 'Janela triangular; simples, com vazamento moderado.'],
              ['Kaiser (β = 14)', 'Vazamento extremamente baixo (cerca de −106 dB), ao custo de um lóbulo principal bem largo (±4,7 linhas).'],
            ]}
          />
          <P>
            Na aba <K>Janelamento</K> você escolhe o início e o fim do trecho no gráfico; o PySQA mostra o sinal janelado e a curva da janela antes
            de criar o novo arquivo.
          </P>
        </Section>

        <Section id="p-ponderacao" title="Ponderação em frequência (A e C)" level={3}>
          <P>
            O ouvido humano é pouco sensível a graves e a agudos extremos. As ponderações <strong>A</strong> e <strong>C</strong> da norma de
            medidores de nível sonoro <Cite ids={['iec61672']} /> imitam essa sensibilidade: a curva A atenua bastante os graves e é a
            usada em limites de ruído (dB(A)); a curva C é mais plana e costuma servir para sons de alto nível.
          </P>
          <Figure n={7} title="Curvas de ponderação A e C (resposta em magnitude) e os valores tabelados na norma."
            note="Ambas valem 0 dB em 1 kHz. Os círculos e losangos são os valores nominais da IEC 61672-1; as curvas passam por eles.">
            <WeightingDemo />
          </Figure>
          <P>
            O PySQA aplica a ponderação <strong>uma única vez</strong>, no domínio da frequência, com a resposta analítica exata da norma e fase
            zero. Verificamos a ponderação contra a tabela da norma em 44,1, 48 e 96 kHz, com diferença máxima de 0,1 dB.
          </P>
          <Callout kind="tip" title="Não pondere antes de calcular métricas psicoacústicas">
            Loudness, sharpness, roughness e as demais métricas já incluem, dentro do modelo, a resposta do ouvido. Aplicar A antes delas
            conta o mesmo efeito duas vezes.
          </Callout>
        </Section>

        <Section id="p-loudness" title="Ajuste de loudness" level={3}>
          <P>
            Para comparar o <em>timbre</em> de dois sons sem que a diferença de volume atrapalhe, a aba <K>Ajuste de loudness</K> ajusta o nível
            de um arquivo até que sua loudness (ISO 532-1, método estacionário, campo livre) seja igual à de um arquivo de referência
            <Cite ids={['iso532']} />. Como a loudness não é proporcional à amplitude (ela cresce com a amplitude elevada a cerca de 0,6),
            o PySQA parte dessa lei de potência e corrige o ganho em passos sucessivos, medindo a loudness de verdade, até acertar dentro
            de 0,5 %. O resultado é um arquivo mono.
          </P>
        </Section>
      </Section>

      {/* ── 7 ── */}
      <Section id="metricas" title="Métricas psicoacústicas">
        <P>
          A psicoacústica mede <em>sensações</em>, e não apenas pressões. Cada métrica abaixo modela uma sensação, tem uma unidade própria e
          um ponto de referência bem definido (o som que vale “1 unidade”). Os gráficos desta seção foram calculados pelo PySQA com sons sintéticos:
          o círculo âmbar marca o ponto de referência, e a curva passa por ele. Esse é o primeiro teste de sanidade de qualquer implementação.
        </P>
        <P>
          Os cálculos usam a biblioteca de código aberto MoSQITo <Cite ids={['mosqito', 'eomys', 'sanmillan2021']} />, que traz as métricas da ISO 532-1, da
          DIN 45692, de Daniel e Weber e também as da ECMA-418-2 (modelo de Sottek). Para a família ECMA-418-2 o PySQA usa de preferência o Sottek Hearing
          Model de Lotinga <Cite ids={['lotinga']} />, e recorre à MoSQITo quando ele não está disponível. NumPy e SciPy fazem o restante <Cite ids={['harris2020', 'virtanen2020']} />. Diversas métricas mostram
          também uma <strong>distribuição por banda crítica</strong>. A escala é a escala Bark:
        </P>
        <Figure n={8} title="Escala Bark e largura da banda crítica em função da frequência."
          source="PySQA (cálculo próprio), com as expressões de Traunmüller (1990) e de Zwicker e Terhardt (1980)."
          note="Abaixo de 500 Hz a banda crítica tem cerca de 100 Hz; acima, ela cresce em proporção à frequência. 24 bandas cobrem toda a audição.">
          <BarkDemo />
        </Figure>
        <P>
          O Bark é a unidade da escala de bandas críticas <Cite ids={['zwicker1961', 'traunmuller1990', 'zwicker1980']} />: faixas de frequência
          dentro das quais o ouvido soma a energia. Os modelos de loudness, sharpness, roughness e fluctuation strength trabalham
          banda a banda e depois combinam o resultado.
        </P>

        <Section id="m-loudness-iso" title="Loudness – ISO 532-1 (Zwicker)" level={3}>
          <P>
            <strong>O que é:</strong> a sensação de “volume”. Unidade: <strong>sone</strong>. 1 sone é a loudness de um tom de 1 kHz a 40 dB SPL;
            dobrar a loudness (2 sone) corresponde a aproximadamente +10 dB.
          </P>
          <Figure n={9} title="Loudness (ISO 532-1) de um tom de 1 kHz em função do nível."
            note="O eixo vertical é logarítmico: a reta mostra que a loudness dobra a cada 10 dB (ponto de 1 sone em 40 dB).">
            <LoudnessChart />
          </Figure>
          <P>
            <strong>Como o PySQA calcula:</strong> pelo método de Zwicker da ISO 532-1 <Cite ids={['iso532', 'fastl2007']} />: o sinal é decomposto em
            bandas, o nível de cada uma é convertido em excitação e daí em <em>loudness específica</em> (sone por Bark, em 240 passos de 0,1 Bark);
            a integral dessa curva é a loudness global. O <K>valor global</K> mostrado é o do método estacionário aplicado a todo o trecho. A curva
            <em> N(t)</em> (método variante no tempo, com o sinal convertido para 48 kHz) é mostrada para inspeção de sons que mudam.
          </P>
          <P><strong>Interpretação:</strong> para sons com forte variação temporal, o valor global é uma média; use a curva no tempo e, se
            necessário, selecione o trecho de interesse.</P>
        </Section>

        <Section id="m-loudness-ecma" title="Loudness – ECMA-418-2 (Sottek)" level={3}>
          <P>
            Calcula a mesma sensação com o Modelo Auditivo de Sottek <Cite ids={['ecma418', 'sottek2016']} />, normalizado na ECMA-418-2. O resultado
            é dado em sone<sub>HMS</sub> e a escala de frequência é a <strong>Bark<sub>HMS</sub></strong>. O valor global é a média em potência no tempo. O PySQA
            usa de preferência a implementação de Lotinga <Cite ids={['lotinga']} /> (ECMA-418-2:2025); se ela não estiver disponível, recorre à implementação da
            MoSQITo <Cite ids={['eomys']} />, que também traz o modelo.
          </P>
          <Callout kind="info">
            Os valores ISO 532-1 e ECMA-418-2 <em>não são intercambiáveis</em>: são modelos diferentes. Compare sempre dentro do mesmo método.
          </Callout>
        </Section>

        <Section id="m-sharpness" title="Sharpness – DIN 45692" level={3}>
          <P>
            <strong>O que é:</strong> o quanto o som é “agudo” ou “estridente”, ligado ao peso das altas frequências. Unidade: <strong>acum</strong>.
            1 acum é a sharpness de um ruído de uma banda crítica centrado em 1 kHz a 60 dB.
          </P>
          <Figure n={10} title="Sharpness (DIN 45692) de um ruído de 1 banda crítica de largura, a 60 dB, em função da frequência central."
            note="A curva sobe devagar até cerca de 15 Bark e dispara nas bandas mais altas, onde a ponderação cresce exponencialmente.">
            <SharpnessChart />
          </Figure>
          <Eq n={3} where={<>N′(z) é a loudness específica (ISO 532-1); z, a banda em Bark; g(z), a ponderação (vale 1 até 15,8 Bark e cresce exponencialmente acima); N, a loudness total. A constante de 0,11 é a normalização que faz o ruído de referência valer 1 acum.</>}>
            S = 0,11 · ∫ N′(z) · g(z) · z dz / N
          </Eq>
          <P>
            <strong>Como o PySQA calcula:</strong> o valor global vem da MoSQITo, seguindo a DIN 45692 <Cite ids={['din45692', 'bismarck1974']} />, a partir da loudness
            específica ISO 532-1 no campo escolhido (livre ou difuso). A curva por Bark mostrada é a contribuição de cada banda para a soma.
          </P>
        </Section>

        <Section id="m-roughness" title="Roughness – Daniel e Weber e ECMA-418-2" level={3}>
          <P>
            <strong>O que é:</strong> a sensação de “aspereza” de sons modulados rapidamente (entre uns 20 e 300 Hz): motores, rolamentos,
            vozes roucas. Unidade: <strong>asper</strong>. 1 asper é a roughness de um tom de 1 kHz a 60 dB com 100 % de modulação em amplitude a 70 Hz.
          </P>
          <Figure n={11} title="Roughness (Daniel e Weber) de um tom de 1 kHz a 60 dB com 100 % de modulação, em função da frequência de modulação."
            note="O máximo está perto de 70 Hz (1 asper), onde o ouvido é mais sensível a essa “aspereza”.">
            <RoughnessChart />
          </Figure>
          <UL>
            <li>
              <strong>Daniel e Weber</strong> <Cite ids={['daniel1997']} />: modelo clássico, com 47 bandas de 0,5 Bark e análise da profundidade de
              modulação em cada uma. O valor global usado é o <strong>percentil 90</strong> da roughness no tempo (valor excedido em 10 % do tempo),
              que não se deixa diluir por pausas. A curva por banda é a média dos instantes acima da mediana.
            </li>
            <li>
              <strong>ECMA-418-2</strong> <Cite ids={['ecma418', 'eomys']} />: modelo baseado no mesmo Modelo Auditivo de Sottek, disponível na MoSQITo e no pacote de Lotinga; o
              global é o percentil 90 da curva no tempo (asper<sub>HMS</sub>).
            </li>
          </UL>
        </Section>

        <Section id="m-fluctuation" title="Fluctuation strength" level={3}>
          <P>
            <strong>O que é:</strong> a sensação de “batimento” lento do volume (até uns 20 Hz), como uma sirene ou um motor em marcha irregular.
            Unidade: <strong>vacil</strong>. 1 vacil é a de um tom de 1 kHz a 60 dB com 100 % de modulação a 4 Hz; o máximo ocorre perto de 4 Hz
            <Cite ids={['fastl2007']} />.
          </P>
          <Figure n={12} title="Fluctuation strength de um tom de 1 kHz a 60 dB com 100 % de modulação, em função da frequência de modulação."
            note="A curva tem o máximo em 4 Hz, como previsto pela literatura, e cai nos dois lados.">
            <FluctuationChart />
          </Figure>
          <Callout kind="warn" title="Implementação própria, não normalizada">
            Não há norma para esta métrica, e a MoSQITo não a oferece. O PySQA usa um modelo próprio, inspirado em Fastl e Zwicker
            <Cite ids={['fastl2007']} />: o sinal é dividido em 47 bandas de 0,5 Bark; em cada uma, extrai-se o envelope, mede-se o índice de
            modulação na frequência dominante (entre 0,5 e 20 Hz) e aplica-se o peso <em>1 / (f<sub>mod</sub>/4 + 4/f<sub>mod</sub>)</em>. As bandas
            são ponderadas pela energia, e uma constante calibra o ponto de referência (1 vacil). Use-a para <strong>comparar</strong> sons,
            e não como valor absoluto normativo.
          </Callout>
        </Section>

        <Section id="m-tonality" title="Tonalidade – ECMA-418-2" level={3}>
          <P>
            <strong>O que é:</strong> quanto o som contém componentes tonais audíveis (um zumbido, um apito) em meio ao ruído. Unidade:
            <strong> tu<sub>HMS</sub></strong>; 1 tu corresponde, aproximadamente, a um tom de 1 kHz a 40 dB SPL.
          </P>
          <Figure n={13} title="Tonalidade (ECMA-418-2) de um tom puro de 1 kHz e de um ruído de banda larga, em função do nível."
            note="O tom tem tonalidade alta e crescente com o nível; o ruído fica perto de zero.">
            <TonalityChart />
          </Figure>
          <P>
            <strong>Como o PySQA calcula:</strong> pela implementação do Modelo Auditivo de Sottek <Cite ids={['ecma418', 'lotinga']} />, que separa, em cada
            banda crítica, a parte tonal da parte de ruído. O PySQA usa uma versão reorganizada desse código, que dá o mesmo resultado (diferença
            abaixo de 1e-6) com cerca de um sexto da memória e um terço do tempo. Ainda é uma das métricas mais pesadas: num computador comum leva
            cerca de 1 s para cada segundo de áudio e usa cerca de 70 MB por segundo de áudio. Para arquivos longos, selecione um trecho.
          </P>
          <P>
            Na coluna da esquerda (e na barra do cálculo em lote) o seletor <strong>Precisão da tonalidade</strong> escolhe entre <strong>Exato</strong>, o padrão,
            e <strong>Rápido</strong>. O Rápido usa uma transformada mais curta na janela de atraso e interpola o pico: leva cerca de metade do tempo, com o valor
            global a até 0,2% do exato e a frequência do tom a cerca de 1 Hz. Os dois resultados ficam guardados separados, e a escolha vale também para a
            exportação.
          </P>
        </Section>

        <Section id="m-ipm" title="IPM – Impulsive Prominence Metric" level={3}>
          <P>
            <strong>O que é:</strong> uma medida de quanto sons <em>impulsivos</em> (estalos, batidas, partidas de compressor) se destacam do restante.
            O PySQA usa o modelo de Silveira e colegas <Cite ids={['silveira2024', 'silveira2026']} />, que estende o método Nordtest NT ACOU 112
            <Cite ids={['nordtest']} /> para bandas de 1/3 de oitava.
          </P>
          <UL>
            <li>O sinal é dividido em 21 bandas de 1/3 de oitava (100 Hz a 10 kHz).</li>
            <li>Em cada banda, localiza-se o pico mais proeminente e analisa-se uma janela de 200 ms ao redor dele.</li>
            <li>A proeminência é <em>P = 3·log₁₀(taxa de subida) + 2·log₁₀(diferença de nível)</em>, como no NT ACOU 112.</li>
            <li>Uma curva de ponderação psicoacústica, derivada de limiares de percepção, é somada às proeminências de cada banda.</li>
            <li>O <strong>valor global</strong> soma as bandas em energia: 10·log₁₀(Σ 10<sup>y/10</sup>), em dB.</li>
          </UL>
          <P>O gráfico mostra o IPM por banda (em Bark<sub>HMS</sub>) e uma linha tracejada no <strong>limiar de impulsividade de 5 dB</strong>.</P>
        </Section>
      </Section>

      {/* ── 8 ── */}
      <Section id="campo" title="Campo livre ou difuso">
        <P>
          Um microfone mede a pressão num ponto; o ouvido, porém, recebe o som de forma diferente conforme o ambiente. Em <strong>campo livre</strong>,
          o som vem de uma direção (sala anecoica, ar livre); em <strong>campo difuso</strong>, chega igualmente de todas as direções (sala reverberante).
          Os modelos corrigem a resposta do ouvido de acordo com essa escolha. Na barra lateral, <K>Tipo de campo</K> aplica-se a: loudness ISO 532-1,
          sharpness, loudness ECMA-418-2, roughness ECMA-418-2 e tonalidade. As demais métricas (roughness D&amp;W, fluctuation strength e IPM)
          não dependem do campo. O padrão é campo livre.
        </P>
      </Section>

      {/* ── 9 ── */}
      <Section id="lote" title="Análise em lote e incômodo">
        <P>
          <K>Lote</K> calcula várias métricas em vários arquivos e junta tudo numa tabela. Marque os arquivos na coluna da esquerda, escolha as métricas
          e clique em <K>Calcular</K>. O cálculo é feito um arquivo e uma métrica por vez, com barra de progresso, estimativa de tempo e botão para cancelar
          (o que já foi calculado é mantido). Se um arquivo tem um trecho selecionado, só ele entra no cálculo. Cálculos que o servidor recusa por falta de
          memória aparecem numa lista de avisos. O resultado pode ser exportado em XLSX.
        </P>
        <P>
          Duas colunas opcionais combinam métricas num único número de <strong>incômodo</strong>, e os dados necessários são adicionados automaticamente:
        </P>
        <Eq n={4} where={<>N em sone (ISO 532-1), S em acum, R em asper (Daniel e Weber) e IPM em dB. É uma regressão linear múltipla, ajustada a julgamentos subjetivos de incômodo, desenvolvida na tese de Silveira <Cite ids={['silveira2024tese']} />.</>}>
          Incômodo SIL = −25,95 + 10,24·N + 13,29·S + 7,75·R + 0,13·IPM
        </Eq>
        <Eq n={5} where={<>Modelo de incômodo psicoacústico de Zwicker e Fastl <Cite ids={['fastl2007']} />, com F em vacil. O PySQA usa a loudness estacionária no lugar de N<sub>5</sub> (a loudness excedida em 5 % do tempo); para sons estacionários os dois coincidem.</>}>
          <span>PA = N · [ 1 + √( w<sub>S</sub>² + w<sub>FR</sub>² ) ]</span><br />
          <span>w<sub>S</sub> = (S − 1,75) · 0,25 · log₁₀(N + 10), se S &gt; 1,75, senão 0</span><br />
          <span>w<sub>FR</sub> = 2,18 / N<sup>0,4</sup> · (0,4·F + 0,6·R)</span>
        </Eq>
        <Callout kind="info" title="Origem do modelo SIL">
          O modelo vem da tese <Cite ids={['silveira2024tese']} text="(SILVEIRA, 2024)" />, em que a percepção de incômodo de ruídos de refrigeradores foi medida em testes
          com ouvintes e relacionada às métricas Loudness, Sharpness, Roughness e MPI (o IPM deste PySQA). A tese apresenta um ajuste para sinais impulsivos
          (R² ajustado de 0,933) e outro para sinais estacionários (R² ajustado de 0,890). Os coeficientes da equação (4) são os implementados no PySQA; para
          reproduzir exatamente um dos ajustes publicados, consulte a Tabela 54 e a Tabela 57 da tese. O modelo foi calibrado com sons de refrigeradores: fora desse tipo
          de fonte, trate-o como índice de comparação.
        </Callout>
      </Section>

      {/* ── 10 ── */}
      <Section id="exportacao" title="Exportação">
        <UL>
          <li><strong>WAV:</strong> baixa o arquivo (o original ou o processado). Arquivos processados são salvos em ponto flutuante de 32 bits, sem perdas.</li>
          <li><strong>XLSX:</strong> planilha com as tabelas dos dados exibidos, uma aba por tabela (por exemplo, forma de onda, espectro e métricas).</li>
          <li><strong>CSV:</strong> uma tabela por vez, gerada no próprio navegador, sem limite de tamanho. Se o trecho foi selecionado, o nome do arquivo o indica.</li>
        </UL>
      </Section>

      {/* ── 11 ── */}
      <Section id="limites" title="Limites e boas práticas">
        <UL>
          <li><strong>Calibre sempre que possível.</strong> Sem calibração, as métricas servem apenas para comparar arquivos gravados da mesma forma.</li>
          <li><strong>Um canal por vez nas métricas.</strong> Estéreo e multicanal usam o canal esquerdo; os gráficos mostram os dois.</li>
          <li><strong>Trechos estacionários ou curtos.</strong> Métricas ECMA-418-2 (tonalidade, roughness e loudness) consomem muito tempo e memória; o servidor avisa quando um cálculo não cabe e sugere selecionar um trecho.</li>
          <li><strong>Taxa de amostragem.</strong> Frequências acima da metade da taxa de amostragem não existem no arquivo; para as métricas, 44,1 e 48 kHz são adequados.</li>
          <li><strong>Filtros de fase zero</strong> preservam a forma de onda, mas aplicam a resposta duas vezes; planeje as frequências de corte considerando os −6 dB.</li>
          <li><strong>Sessões.</strong> Seus arquivos ficam na memória do servidor durante a sessão; o navegador guarda uma cópia e reenvia sozinho se o servidor reiniciar.</li>
        </UL>
      </Section>

      {/* ── 12 ── */}
      <Section id="agradecimentos" title="Agradecimentos">
        <P>
          Boa parte do que o PySQA calcula só existe porque outras pessoas decidiram compartilhar seu trabalho como código aberto. Agradecemos em especial:
        </P>
        <UL>
          <li>
            à equipe da <strong>MoSQITo</strong> (Eomys Engineering e Green Forge Coop) <Cite ids={['eomys', 'mosqito']} />, que reuniu em uma biblioteca livre as métricas
            da ISO 532-1, DIN 45692, Daniel e Weber e ECMA-418-2 (modelo de Sottek), e a todos que contribuem com ela;
          </li>
          <li>
            a <strong>Mike Lotinga</strong> <Cite ids={['lotinga']} />, pela implementação em Python do Modelo Auditivo de Sottek, e a <strong>Roland Sottek</strong> <Cite ids={['sottek2016']} />,
            autor do modelo;
          </li>
          <li>às comunidades do <strong>NumPy</strong> e do <strong>SciPy</strong> <Cite ids={['harris2020', 'virtanen2020']} />.</li>
        </UL>
      </Section>

      <Section id="referencias" title="Referências">
        <Bibliography />
      </Section>
    </article>
  )
}

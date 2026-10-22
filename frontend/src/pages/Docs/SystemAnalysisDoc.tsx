import { Bibliography, Callout, Cite, Eq, Figure, K, P, Section, Table, UL } from './ui'
import {
  BodeCoherenceChart, EstimatorsChart, HalfPowerDemo, ImpactWindowsDemo, ModesCheckTable, ModesFoundChart, NyquistModeChart, ResolutionDemo,
} from './saDemos'

export default function SystemAnalysisDoc() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">System Analysis</h1>
        <P>
          A System Analysis responde à pergunta: <em>“se eu empurro este sistema, como ele responde?”</em> A partir de uma medição de entrada (uma força, um
          sinal de excitação) e de uma ou mais respostas (aceleração, pressão sonora), ela calcula a <strong>função de resposta em frequência</strong> (FRF), mostra
          os diagramas de Bode, mede a qualidade da medição pela coerência e encontra os <strong>modos</strong> do sistema, com suas frequências naturais e seu amortecimento.
        </P>
        <Callout kind="tip" title="Como ler esta página">
          Cada recurso tem o que ele é, como o PySQA calcula e o que observar. Os gráficos usam um sistema simulado de três modos com valores conhecidos (87,3; 213,6 e 390,2 Hz),
          de modo que você pode ver quanto o PySQA acerta. As referências estão em ABNT ao final.
        </Callout>
      </header>

      <Section id="visao-geral" title="Visão geral">
        <P>O caminho típico:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Carregar</strong> os registros (UFF, WAV ou CSV).</li>
          <li><strong>Indicar</strong> qual canal é a <em>entrada</em> (a excitação) e quais são as <em>saídas</em> (as respostas).</li>
          <li><strong>Escolher</strong> o estimador, o tipo de média (contínuo ou impacto) e o comprimento do bloco. O cálculo roda sozinho a cada mudança.</li>
          <li><strong>Examinar</strong> o Bode, a coerência, as partes real e imaginária, o Nyquist e os modos.</li>
          <li><strong>Exportar</strong> a FRF e a tabela de modos em CSV.</li>
        </ol>
      </Section>

      <Section id="mapa" title="Mapa de recursos">
        <Table
          head={['Recurso', 'O que faz', 'Opções']}
          widths={['22%', '50%', '28%']}
          rows={[
            ['Arquivos', 'Lê registros no tempo e FRFs já prontas', 'UFF (dataset 58), WAV, CSV'],
            ['Canais', 'Define entrada (um) e saídas (vários)', 'Marcação na tabela de canais'],
            ['Estimador', 'Como a FRF é calculada', 'H1, H2, Hv'],
            ['Média', 'Como as médias são formadas', 'Aleatório / contínuo (Welch); Impacto (martelo)'],
            ['Comprimento do bloco', 'Tamanho de cada bloco da FFT', '512 a 65 536 amostras'],
            ['Sobreposição / Janela', 'Sobreposição e janela dos blocos', '0 a 75 %; Hann, Hamming, Blackman, flat-top, retangular'],
            ['Impacto', 'Detecção dos golpes e janelas', 'Nível de disparo, Pré-disparo, Janela de força, Janela exponencial'],
            ['Grandeza da resposta', 'Converte aceleração, velocidade e deslocamento', 'Acelerância, mobilidade, receptância'],
            ['Faixa de frequência', 'Faixa mostrada e analisada', 'De… até…; desenrolar a fase'],
            ['Vistas', 'Formas de ver a FRF', 'Bode, Real / Imag, Nyquist, Modos'],
            ['Modos', 'Detecção de modos e amortecimento', 'Proeminência, espaçamento, método'],
            ['Exportar', 'Salva os resultados', 'FRF CSV; Modos CSV'],
          ]}
        />
      </Section>

      <Section id="conceitos" title="Conceitos básicos">
        <P>
          Imagine bater numa viga com um martelo (a <strong>entrada</strong>) e medir com um acelerômetro como ela se mexe (a <strong>saída</strong>). A FRF é a razão,
          frequência por frequência, entre o que sai e o que entra:
        </P>
        <Eq n={1} where={<>X(f): espectro da entrada; Y(f): espectro da saída. H é um número complexo em cada frequência: o módulo diz <em>quanto</em> o sistema amplifica, e a fase, <em>quanto atrasa</em>.</>}>
          H(f) = Y(f) / X(f)
        </Eq>
        <P>
          Onde o sistema tem uma <strong>ressonância</strong> (um modo), o módulo da FRF tem um pico: ali, uma força pequena produz uma resposta grande, e a fase muda de sentido
          em cerca de 180°. Quanto mais estreito o pico, menor o amortecimento.
        </P>
        <P>
          Conforme o que você mede na saída, a FRF recebe um nome <Cite ids={['ewins2000']} />:
        </P>
        <Table
          head={['Saída medida', 'FRF', 'Relação com a receptância']}
          widths={['30%', '30%', '40%']}
          rows={[
            ['Deslocamento / força', 'Receptância (flexibilidade)', 'H'],
            ['Velocidade / força', 'Mobilidade', 'jω · H'],
            ['Aceleração / força', 'Acelerância (inertância)', '(jω)² · H = −ω² · H'],
          ]}
        />
        <P>
          O PySQA converte entre as três: você diz o que o seu sensor mede (<K>O canal de resposta mede</K>) e como quer ver a FRF (<K>Mostrar a FRF como</K>). O cálculo de
          amortecimento é sempre feito na forma de receptância, e por isso a primeira escolha deve refletir o seu sensor.
        </P>
      </Section>

      <Section id="dados" title="Carregando as medições">
        <UL>
          <li><strong>UFF</strong> (<em>Universal File Format</em>, dataset 58): o formato da maioria dos sistemas de aquisição de vibração. O PySQA lê registros no tempo (tipo 1) e FRFs (tipo 4), com a biblioteca pyuff <Cite ids={['pyuff']} />.</li>
          <li><strong>WAV:</strong> cada canal do arquivo vira um registro. Um WAV estéreo com a força em um canal e a resposta no outro serve.</li>
          <li><strong>CSV:</strong> uma tabela com uma coluna de tempo seguida dos canais (a taxa vem do tempo). Sem coluna de tempo, digite a taxa em <K>Taxa de amostragem do CSV (Hz)</K>.</li>
        </UL>
        <P>
          Depois de carregar, a tabela <K>Canais</K> lista cada registro. Marque o círculo laranja em <strong>Entrada</strong> para a entrada (um canal) e as caixas em <strong>Saída</strong> para as
          respostas (quantas quiser: todas serão calculadas contra a mesma entrada). Com exatamente dois registros, o PySQA já marca o primeiro como entrada e o segundo como saída.
          FRFs que já vêm prontas num arquivo UFF aparecem em <K>FRFs medidas nos arquivos</K> e são desenhadas como estão, sem precisar de entrada.
        </P>
        <Callout kind="info" title="Os registros e o servidor">
          Os registros ficam guardados no servidor durante a sessão (até 30 minutos sem uso), e o navegador guarda os arquivos originais. Se o servidor reiniciar, o PySQA reenvia
          sozinho e refaz o cálculo. Todos os registros de uma análise precisam ter a mesma taxa de amostragem.
        </Callout>
      </Section>

      <Section id="estimar" title="Estimando a FRF">
        <Section id="e-welch" title="Médias para sinais contínuos (Welch)" level={3}>
          <P>
            Para excitações que duram (ruído aleatório de um excitador, uma varredura), o registro é dividido em <strong>blocos</strong> que se sobrepõem; cada bloco recebe uma janela
            e passa pela FFT, e os espectros são <strong>médios</strong> entre os blocos. Essa é a ideia do método de Welch <Cite ids={['welch1967']} />: a média reduz o ruído da estimativa,
            e a sobreposição aproveita bem os dados.
          </P>
          <UL>
            <li><strong>Comprimento do bloco:</strong> o tamanho do bloco define a resolução em frequência (Δf = fs / N). Blocos longos separam melhor modos próximos, mas dão menos médias, e o bloco deve ser mais longo que a resposta do sistema.</li>
            <li><strong>Sobreposição:</strong> 50 % por padrão. Com janela de Hann, 50 a 75 % aproveita bem os dados.</li>
            <li><strong>Janela:</strong> Hann por padrão <Cite ids={['harris1978']} />. A flat-top mede melhor a altura dos picos, a retangular só serve para sinais que cabem exatamente no bloco.</li>
          </UL>
          <Figure n={1} title="Resolução, duração do bloco e número de médias. Ajuste a taxa, o bloco e a duração da gravação." source="PySQA (simulação nesta página)."
            note="Comprimento de bloco e duração da gravação são um compromisso: para ter muitas médias com blocos longos, é preciso gravar por mais tempo.">
            <ResolutionDemo />
          </Figure>
        </Section>

        <Section id="e-estimadores" title="Estimadores H1, H2 e Hv" level={3}>
          <P>
            Medições reais têm ruído. Dependendo de onde ele está, uma forma de calcular a FRF é melhor que a outra <Cite ids={['brandt2011', 'bendat2010']} />. Com os espectros médios da
            entrada (S<sub>xx</sub>), da saída (S<sub>yy</sub>) e cruzado (S<sub>xy</sub>):
          </P>
          <Eq n={2} where={<>S<sub>xy</sub> = E[X*·Y]: o espectro cruzado médio entre entrada e saída; S<sub>xx</sub> e S<sub>yy</sub>, os autoespectros.</>}>
            <span>H1 = S<sub>xy</sub> / S<sub>xx</sub></span><br />
            <span>H2 = S<sub>yy</sub> / S<sub>yx</sub></span>
          </Eq>
          <UL>
            <li><strong>H1:</strong> é a melhor escolha quando o ruído está na <em>saída</em>. Se a entrada tem ruído, H1 <em>subestima</em> a FRF, principalmente nos picos.</li>
            <li><strong>H2:</strong> melhor quando o ruído está na <em>entrada</em>. Com ruído na saída, <em>superestima</em> (o ruído soma ao autoespectro da saída).</li>
            <li><strong>Hv:</strong> usa o método dos mínimos quadrados totais, que supõe ruído nos dois lados. Como a entrada e a saída têm unidades diferentes, o PySQA primeiro as põe na mesma escala (pela razão das potências médias). Ela fica entre H1 e H2.</li>
          </UL>
          <Figure n={2} title="Os três estimadores quando a força tem muito ruído (70 % do seu desvio-padrão), no pico de 213,6 Hz."
            source="PySQA (cálculo próprio, sistema simulado de três modos, 240 s de ruído aleatório)."
            note="A linha tracejada é a FRF verdadeira. H1 fica quase 4 dB abaixo dela, porque o ruído na entrada infla o denominador; H2 e Hv ficam muito perto da curva verdadeira.">
            <EstimatorsChart />
          </Figure>
          <Callout kind="tip">Uma boa rotina é calcular H1 e H2 e compará-los. Se forem quase iguais, o ruído é pequeno; se forem muito diferentes, desconfie da medição.</Callout>
        </Section>

        <Section id="e-coerencia" title="Coerência: o medidor de confiança" level={3}>
          <P>
            A coerência mede, frequência por frequência, a parte da resposta que pode ser explicada pela entrada <Cite ids={['bendat2010']} />. Varia de 0 a 1:
          </P>
          <Eq n={3}>γ²(f) = |S<sub>xy</sub>|² / ( S<sub>xx</sub> · S<sub>yy</sub> )</Eq>
          <UL>
            <li><strong>Perto de 1:</strong> a saída vem da entrada que você mediu; a FRF é confiável.</li>
            <li><strong>Abaixo de 0,8:</strong> há ruído, não linearidade, outras fontes de excitação ou vazamento espectral. Desconfie daquela faixa.</li>
            <li><strong>Quedas esperadas:</strong> nas <em>antirressonâncias</em> (os vales) a resposta é pequena e o ruído pesa mais, e a coerência cai de modo natural.</li>
          </UL>
          <Callout kind="warn">A coerência só pode ser calculada com <strong>duas ou mais médias</strong>. Com uma única, o PySQA avisa e não a mostra.</Callout>
          <Figure n={3} title="FRF (acelerância), fase e coerência de um sistema de três modos, medido com ruído aleatório."
            source="PySQA (cálculo próprio, estimador H1, 119 médias, 240 s de gravação)."
            note="O resultado coincide com a curva verdadeira (tracejada) nos picos; a coerência fica perto de 1, com quedas nos vales entre os modos.">
            <BodeCoherenceChart />
          </Figure>
        </Section>
      </Section>

      <Section id="impacto" title="Ensaio com martelo de impacto">
        <P>
          Num ensaio de impacto, a excitação é um golpe curto. O PySQA procura os golpes, extrai um bloco ao redor de cada um, calcula o espectro de cada bloco e tira a média,
          como na norma de mobilidade por impacto <Cite ids={['iso76265', 'ewins2000']} />.
        </P>
        <UL>
          <li><strong>Nível de disparo (padrão 20 % do pico):</strong> um golpe é o primeiro instante em que a força chega a essa fração do maior valor. Golpes a menos de um bloco de distância (duplos) são ignorados.</li>
          <li><strong>Pré-disparo (padrão 5 % do bloco):</strong> parte do bloco que vem antes do golpe, para o início do sinal não ser cortado e para estimar o nível de repouso (que é subtraído).</li>
          <li><strong>Janela de força (padrão 8 ms):</strong> a força vale zero depois desse tempo, o que elimina o ruído de fundo do martelo depois do golpe.</li>
          <li><strong>Janela exponencial (padrão 1 %):</strong> uma janela exponencial na resposta que a faz chegar a essa porcentagem no fim do bloco, para que ela termine em zero e não seja cortada.</li>
        </UL>
        <Figure n={4} title="As duas janelas do ensaio de impacto. Mude a janela de força e o fim da exponencial e veja o amortecimento que ela acrescenta."
          source="PySQA (simulação nesta página; modo de 100 Hz com ζ = 2 %)." note="A exponencial é uma ferramenta útil, mas “engana” o amortecimento: o PySQA conhece a taxa que usou e a subtrai da estimativa.">
          <ImpactWindowsDemo />
        </Figure>
        <Callout kind="warn" title="Se nenhum golpe for encontrado">
          O PySQA avisa e sugere baixar o <K>Nível de disparo</K>, conferir o canal de excitação ou trocar para <K>Aleatório / contínuo</K>. Um registro com um único golpe tem uma só média,
          e a coerência não pode ser calculada: junte vários golpes.
        </Callout>
      </Section>

      <Section id="vistas" title="Vistas dos resultados">
        <UL>
          <li><strong>Bode:</strong> o módulo da FRF em dB, a fase em graus e, abaixo, a coerência, com eixo de frequência logarítmico ou linear. Cada resposta tem sua cor. <K>Desenrolar a fase</K> desenrola a fase (sem saltos de 360°).</li>
          <li><strong>Real / Imag:</strong> as partes real e imaginária. Bons para ver a forma de cada ressonância: a parte imaginária tem seu máximo no pico.</li>
          <li><strong>Nyquist:</strong> a parte imaginária contra a real. Cada modo desenha um círculo (figura abaixo); modos bem separados são círculos separados.</li>
          <li><strong>Modos:</strong> o indicador de modos com os picos marcados e a tabela de resultados.</li>
        </UL>
        <Figure n={5} title="Diagrama de Nyquist da receptância de um modo (100 Hz, ζ = 3 %). O círculo é percorrido no sentido horário, da direita para a esquerda, conforme a frequência sobe."
          source="PySQA (simulação nesta página)." note="Ao passar pela ressonância, o ponto atravessa o ponto mais baixo do círculo, onde a parte imaginária é máxima em módulo.">
          <NyquistModeChart />
        </Figure>
        <P>
          <K>Faixa de frequência</K> restringe a faixa mostrada e a analisada (a frequência zero nunca é mostrada). A faixa útil é limitada, no alto, pela frequência de Nyquist, e em baixo,
          pela resolução do bloco.
        </P>
      </Section>

      <Section id="modos" title="Detecção de modos e amortecimento">
        <Section id="m-deteccao" title="Achando os picos" level={3}>
          <P>
            Com várias respostas, qual curva usar para achar os picos? O PySQA combina todas no <strong>indicador de modos</strong> (MIF):
          </P>
          <Eq n={4} where={<>H<sub>i</sub>(f): a FRF da resposta i. Com uma só resposta, a MIF é o próprio módulo da FRF.</>}>
            MIF(f) = √( Σ<sub>i</sub> |H<sub>i</sub>(f)|² )
          </Eq>
          <P>
            Um modo aparece como um pico na MIF mesmo se estiver pouco visível em uma das respostas (por exemplo, perto de um nó da forma modal daquela resposta).
            O PySQA procura picos na curva em dB:
          </P>
          <UL>
            <li><strong>Proeminência do pico (padrão 6 dB):</strong> o quanto o pico precisa se destacar do vale ao redor. Aumente para ignorar ruído; baixe para ver modos fracos.</li>
            <li><strong>Espaçamento mín.:</strong> distância mínima entre dois picos (padrão: duas linhas da FFT, no mínimo 1 Hz).</li>
            <li>No máximo 12 modos, os mais proeminentes. A frequência de cada pico é refinada por interpolação parabólica entre as linhas vizinhas.</li>
          </UL>
          <Figure n={6} title="Indicador de modos do sistema simulado, com os três modos detectados." source="PySQA (cálculo próprio).">
            <ModesFoundChart />
          </Figure>
        </Section>

        <Section id="m-amortecimento" title="Medindo o amortecimento" level={3}>
          <P>
            O <strong>amortecimento</strong> diz com que rapidez a vibração se extingue. É dado pela razão de amortecimento ζ (um número sem unidade, em %) ou, de modo equivalente,
            pelo fator de qualidade Q = 1 / (2ζ): quanto mais agudo o pico, maior o Q. O PySQA dá duas estimativas <Cite ids={['ewins2000']} />:
          </P>
          <P><strong>1. Método da meia-potência (−3 dB).</strong> Mede-se a largura do pico na altura de 70,7 % do máximo (−3 dB):</P>
          <Eq n={5} where={<>f<sub>1</sub> e f<sub>2</sub>: as frequências, antes e depois do pico, em que o módulo cai a 1/√2 do máximo; f<sub>n</sub>: a frequência do pico.</>}>
            ζ ≈ ( f<sub>2</sub> − f<sub>1</sub> ) / ( 2 · f<sub>n</sub> )
          </Eq>
          <Figure n={7} title="O método da meia-potência. Aumente o amortecimento e veja a largura do pico crescer."
            source="PySQA (simulação nesta página)." note="A aproximação é ótima para amortecimentos pequenos (em geral, até alguns por cento) e vai se afastando quando o amortecimento cresce.">
            <HalfPowerDemo />
          </Figure>
          <P>
            <strong>2. Ajuste de um modo.</strong> Em volta do pico, o PySQA ajusta à FRF medida a curva teórica de um sistema de um grau de liberdade,
            com a frequência natural e o amortecimento como incógnitas (compartilhados por todas as respostas) e um termo constante que representa a influência dos modos vizinhos.
            Esse ajuste usa os pontos da curva inteira, e não só dois, e por isso é mais robusto ao ruído e funciona também quando os modos estão próximos.
            O valor <K>Amortecimento ζ (%)</K> mostrado na tabela é o do ajuste quando ele converge, e o da meia-potência nos demais casos.
          </P>
          <Callout kind="info" title="Correção da janela exponencial">
            No ensaio de impacto, a janela exponencial acrescenta amortecimento artificial. O PySQA subtrai esse acréscimo (k / ω<sub>n</sub>) dos valores mostrados.
          </Callout>
          <Callout kind="warn" title="Quando desconfiar do amortecimento">
            O PySQA acrescenta um aviso ao modo quando: o pico tem poucas linhas (menos de 3 dentro da largura de −3 dB: use um bloco maior), há outro modo tão
            perto que a largura não pode ser medida, ou a coerência no pico é menor que 0,8.
          </Callout>
        </Section>

        <Section id="m-verificacao" title="Conferindo com o sistema simulado" level={3}>
          <P>
            Para saber se o PySQA acerta, gerou-se uma medição de um sistema simulado cujos modos são conhecidos, com ruído de medição, e comparou-se o resultado
            com o valor verdadeiro. A tabela traz as frequências e os amortecimentos verdadeiros e os estimados, tanto com ruído aleatório quanto com nove golpes de martelo (com a correção da janela exponencial).
          </P>
          <ModesCheckTable />
          <p className="text-[12px] text-muted max-w-[72ch]">
            Fonte: PySQA (cálculo próprio). Medição de 240 s de ruído aleatório (bloco de 8 192 amostras a 2 048 Hz, resolução de 0,25 Hz) e de 40 s com nove golpes. As diferenças nas frequências ficam abaixo de 0,02 Hz,
            e as de amortecimento do ajuste, em no máximo 3,5 % do valor verdadeiro (no pior modo).
          </p>
          <Callout kind="tip">
            Os valores verdadeiros não são conhecidos numa medição real. Como conferência, repita a medição, compare H1 e H2 e observe se o ζ do ajuste e o da meia-potência concordam: quando discordam muito, algo
            (ruído, modos próximos, resolução) está atrapalhando.
          </Callout>
        </Section>
      </Section>

      <Section id="exportacao" title="Exportação">
        <UL>
          <li><strong>FRF CSV:</strong> uma linha por frequência, com, para cada resposta, módulo (dB), fase (°), parte real, parte imaginária e coerência.</li>
          <li><strong>Modos CSV:</strong> uma linha por modo: frequência, amortecimento (%) total, pela meia-potência e pelo ajuste, Q, largura de −3 dB, coerência no pico e nível.</li>
        </UL>
      </Section>

      <Section id="limites" title="Limites e boas práticas">
        <UL>
          <li><strong>Sistema linear e estacionário.</strong> A FRF só descreve bem sistemas que respondem em proporção à força e não mudam durante a medição. Coerência baixa em toda a faixa sugere não linearidade.</li>
          <li><strong>Resolução versus médias.</strong> O bloco precisa ser mais longo que o tempo de extinção da resposta, e o registro deve ter muitos blocos. Veja a Figura 1.</li>
          <li><strong>Vazamento.</strong> Se a resposta não se extingue no bloco, use janela exponencial (impacto) ou mais sobreposição e janela de Hann (contínuo).</li>
          <li><strong>Golpes limpos.</strong> Evite golpes duplos; confira a janela de força. Um golpe duro excita mais altas frequências, um macio, menos.</li>
          <li><strong>Sensores.</strong> O PySQA não aplica a sensibilidade dos sensores: use sinais já em unidades de engenharia (N, m/s²) ou lembre-se de que a FRF está em unidades do arquivo.</li>
          <li><strong>Modos próximos.</strong> Se dois picos se fundem, a meia-potência falha; confie no ajuste e aumente a resolução.</li>
          <li><strong>Limites do servidor.</strong> O servidor guarda uma quantidade limitada de registros por sessão e informa se não couber.</li>
        </UL>
      </Section>

      <Section id="referencias" title="Referências">
        <Bibliography />
      </Section>
    </article>
  )
}

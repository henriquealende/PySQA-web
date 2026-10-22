import { Link } from 'react-router-dom'
import { Bibliography, Callout, Cite, Eq, Figure, K, P, Section, Table, UL } from './ui'
import { AveragingDemo, BitsDemo, CalibrationDemo, FastDemo, SamplingDemo, TriggerDemo } from './daDemos'

export default function DataAcquisitionDoc() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Data Acquisition</h1>
        <P>
          A Data Acquisition grava o som direto do microfone do seu computador, tablet ou celular, no navegador. Ela mostra o nível em tempo real, calibra o
          microfone, dispara a gravação por nível, calcula médias de várias gravações e leva o resultado, já calibrado, ao Post-Processing. Nada é enviado ao
          servidor até você pedir.
        </P>
        <Callout kind="tip" title="Como ler esta página">
          Cada recurso tem o que ele é, como o PySQA faz e o que observar. Os controles desta página são simulações: mexa neles para ver o efeito antes de gravar.
          As referências estão em ABNT ao final.
        </Callout>
      </header>

      <Section id="visao-geral" title="Visão geral">
        <P>O caminho mais comum:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Ajustar</strong> (coluna da esquerda): microfone, taxa de amostragem, canais, bits, duração e modo de captura.</li>
          <li><strong>Calibrar</strong> com um calibrador acústico (ou digitando a sensibilidade) para ler dB SPL.</li>
          <li><strong>Monitorar</strong> (<K>Monitorar</K>): abre o microfone e mostra nível, forma de onda e espectro ao vivo, sem gravar.</li>
          <li><strong>Gravar</strong> (<K>Gravar</K>, ou <K>Aguardar</K> no modo por nível) e parar (<K>Parar</K>).</li>
          <li><strong>Revisar:</strong> ouça e veja o take; <K>Aceitar</K> guarda, <K>Descartar</K> descarta.</li>
          <li><strong>Usar:</strong> baixar WAV ou CSV, ou enviar ao Post-Processing.</li>
        </ol>
        <Callout kind="info" title="Funciona em segundo plano">
          Se você trocar de página com o microfone aberto, ele continua aberto e a gravação segue. Um ponto pulsante na aba “Data Acquisition” avisa
          (âmbar: monitorando; laranja: gravando). Ao fechar a aba com um take não salvo, o navegador pergunta antes.
        </Callout>
      </Section>

      <Section id="mapa" title="Mapa de recursos">
        <Table
          head={['Recurso', 'O que faz', 'Opções']}
          widths={['22%', '50%', '28%']}
          rows={[
            ['Dispositivo de entrada', 'Escolhe o microfone', 'Lista do sistema; Atualizar'],
            ['Taxa de amostragem', 'Quantas amostras por segundo', '44 100, 48 000 ou 96 000 Hz'],
            ['Canais', 'Mono, ou estéreo reduzido a mono', 'Mono; Estéreo→Mono'],
            ['Resolução (bits)', 'Formato do arquivo gravado', '16 bits (PCM) ou 32 bits (ponto flutuante)'],
            ['Duração', 'Gravar até apertar Parar, ou por tempo exato', 'Livre; Fixa (1 a 3 600 s)'],
            ['Modo de captura', 'Gravar já, ou esperar o som aparecer', 'Imediato; Disparo por nível'],
            ['Disparo', 'Parâmetros do disparo por nível', 'Limiar, Pré-gravação, Espera final, Borda'],
            ['Média de takes', 'Média de vários takes', '2 a 99 takes; início automático'],
            ['Calibração do microfone', 'Converte o nível digital em dB SPL', 'Calibrador (94, 114 dB ou outro); sensibilidade em mV/Pa'],
            ['Proteção do sinal', 'Descarta takes saturados e para no silêncio', 'Abortar por sobrecarga; Parar no silêncio'],
            ['Nível (VU) e medidor de SPL', 'Nível ao vivo; Fast, Leq, Máx. e Pico', 'Ponderação A ou Z; Zerar'],
            ['Forma de onda e espectro ao vivo', 'Últimos 3 s e espectro ao vivo', 'Média do espectro (Média)'],
            ['Gravações', 'Lista de takes guardados no navegador', 'Ouvir, WAV, CSV, enviar, apagar'],
          ]}
        />
      </Section>

      <Section id="microfone" title="Microfone e permissão">
        <P>
          O navegador só libera o microfone com a sua permissão, e só em páginas seguras (<strong>https</strong> ou <strong>localhost</strong>)
          <Cite ids={['w3cmedia']} />. Ao apertar <K>Monitorar</K> pela primeira vez, aceite o aviso do navegador; só então os nomes reais dos dispositivos aparecem na lista.
        </P>
        <P>
          Para gravar o som como ele é, o PySQA <strong>desliga</strong> o cancelamento de eco, a supressão de ruído e o controle automático de ganho que
          navegadores costumam ligar por padrão. Medições exigem um sinal que não seja “melhorado” sem o seu conhecimento.
        </P>
        <Callout kind="warn" title="Fixe o ganho do microfone">
          O sistema operacional e alguns microfones USB têm um controle de volume de entrada. Qualquer mudança nele depois da calibração invalida a calibração.
          Ajuste o ganho uma vez, calibre e não mexa mais.
        </Callout>
      </Section>

      <Section id="amostragem" title="Taxa de amostragem, canais e bits">
        <Section id="a-taxa" title="Taxa de amostragem" level={3}>
          <P>
            Um som é uma vibração contínua; o computador a guarda como uma sequência de “fotografias” (amostras) tiradas a intervalos iguais. A taxa de amostragem
            diz quantas por segundo. Só dá para registrar com fidelidade frequências até <strong>metade</strong> da taxa (a frequência de Nyquist)
            <Cite ids={['shannon1949', 'oppenheim2010']} />. Acima disso, o tom é “dobrado” para uma frequência mais baixa que não existia, o <em>aliasing</em>.
          </P>
          <Figure n={1} title="Amostragem de um tom. Arraste a frequência acima de Nyquist e veja o tom que o computador registra."
            source="PySQA (simulação nesta página)."
            note="Em microfones reais, um filtro na entrada do conversor remove o que passa de Nyquist antes de amostrar, o que evita o problema.">
            <SamplingDemo />
          </Figure>
          <UL>
            <li><strong>44,1 e 48 kHz</strong> cobrem toda a audição (até 20 kHz) e são adequadas às métricas psicoacústicas.</li>
            <li><strong>96 kHz</strong> serve para conteúdo ultrassônico ou análise de transientes muito rápidos; o arquivo fica duas vezes maior.</li>
            <li>A taxa escolhida é a do arquivo gravado; se o dispositivo trabalhar em outra, o navegador converte.</li>
          </UL>
        </Section>

        <Section id="a-canais" title="Canais" level={3}>
          <P>
            O PySQA grava um único canal. <K>Estéreo→Mono</K> pede ao dispositivo dois canais e os combina em um (média dos dois). Use <K>Mono</K> com microfones simples.
          </P>
        </Section>

        <Section id="a-bits" title="Bits por amostra" level={3}>
          <P>
            Cada amostra é arredondada para um de 2<sup>N</sup> valores possíveis. O erro desse arredondamento é um ruído de fundo de nível constante, que fixa a
            <em> faixa dinâmica</em> do arquivo: cerca de 6 dB para cada bit <Cite ids={['oppenheim2010']} />.
          </P>
          <Eq n={1} where={<>Relação sinal-ruído teórica de um tom de amplitude máxima quantizado com N bits.</>}>
            SNR ≈ 6,02 · N + 1,76 dB
          </Eq>
          <Figure n={2} title="Quantização de um tom com poucos bits. Aumente os bits até o erro (à direita) quase desaparecer." source="PySQA (simulação nesta página).">
            <BitsDemo />
          </Figure>
          <UL>
            <li><strong>16 bits (PCM):</strong> faixa de cerca de 98 dB, suficiente para a maioria das medições, e arquivos compactos. Sinais acima do fundo de escala são cortados (saturam).</li>
            <li><strong>32 bits (ponto flutuante):</strong> ruído de quantização muito abaixo de qualquer ruído real do microfone e margem enorme contra saturação interna. É o formato indicado quando o nível é incerto.</li>
          </UL>
        </Section>
      </Section>

      <Section id="duracao" title="Duração e parada exata">
        <P>
          Em <K>Livre</K>, a gravação dura até você apertar <K>Parar</K>. Em <K>Fixa</K>, ela dura o tempo pedido, de 1 a 3 600 s. A contagem é feita
          <strong> em amostras</strong>, na própria thread de áudio do navegador, e não por um cronômetro da página: um take de 5 s a 48 kHz tem exatamente 240 000 amostras.
          O relógio na tela segue as amostras gravadas, não o tempo do computador.
        </P>
        <Callout kind="info" title="Por que isso importa">
          Cronômetros de página atrasam dezenas de milissegundos conforme a carga do computador. Contando amostras, as durações, as pré-gravações e as esperas
          do disparo saem com a precisão de uma amostra.
        </Callout>
      </Section>

      <Section id="disparo" title="Captura por nível (trigger)">
        <P>
          Em <K>Disparo por nível</K>, você aperta <K>Aguardar</K> e o PySQA fica de olho no sinal; a gravação só começa quando o nível cruza um limiar. É o modo ideal
          para eventos curtos e imprevisíveis, como um estalo, uma partida de compressor ou uma porta batendo.
        </P>
        <UL>
          <li><strong>Limiar:</strong> o nível, de −80 a 0 dBFS, que dispara a gravação.</li>
          <li><strong>Borda:</strong> <em>Subida</em> dispara quando o nível sobe acima do limiar; <em>Descida</em>, quando cai abaixo.</li>
          <li>
            <strong>Pré-gravação</strong> (0 a 5 s): enquanto espera, o PySQA mantém na memória os últimos segundos de áudio. Quando dispara, esse trecho vem
            <em> antes</em> do disparo, de modo que o começo do evento não se perde.
          </li>
          <li><strong>Espera final</strong> (0,5 a 10 s): depois do disparo, a gravação termina quando o sinal ficar abaixo do limiar por esse tempo.</li>
        </UL>
        <Figure n={3} title="Disparo por nível sobre um registro simulado com dois eventos. A área verde é o que seria gravado."
          source="PySQA (simulação nesta página)."
          note="Baixe o limiar até pegar o segundo evento, mais fraco; aumente a espera final para unir os dois em um só take.">
          <TriggerDemo />
        </Figure>
        <Callout kind="tip">A linha tracejada do limiar também aparece no espectro ao vivo enquanto você espera o disparo.</Callout>
      </Section>

      <Section id="media" title="Média de vários takes">
        <P>
          Com <K>Média de takes</K> ligado, você grava de 2 a 99 takes (com <K>Iniciar o próximo take sozinho</K> ele recomeça sozinho) e o PySQA entrega um único arquivo, a
          <strong> média no tempo</strong> de todos, amostra a amostra, cortados pelo menor deles. Cada take passa pela revisão (<K>Aceitar</K> ou <K>Descartar</K>) antes de
          entrar na média; o resultado é salvo como <K>…_avgN</K>.
        </P>
        <P>
          Isso funciona para sinais que <strong>se repetem de forma idêntica e sincronizada</strong>, como a resposta a um impacto disparado sempre do mesmo jeito:
          o sinal se soma e o ruído, que é diferente a cada take, se cancela em parte. O ruído cai com a raiz de N, ou seja, a relação sinal-ruído sobe 3 dB a cada vez
          que o número de takes dobra <Cite ids={['bendat2010']} />.
        </P>
        <Figure n={4} title="Média de takes de uma resposta repetitiva com ruído. Aumente o número de takes e o ruído diminui." source="PySQA (simulação nesta página).">
          <AveragingDemo />
        </Figure>
        <Callout kind="warn" title="Não use para ruído aleatório">
          Se o som é um ruído contínuo (um motor, um ventilador), os takes não coincidem no tempo e a média simplesmente <em>reduz</em> o sinal. Para esses sons,
          grave um take mais longo e use o <em>Average</em> do espectro ao vivo ou as análises do Post-Processing.
        </Callout>
      </Section>

      <Section id="calibracao" title="Calibração do microfone">
        <P>
          Sem calibração, o PySQA só sabe dizer o nível em <strong>dBFS</strong> (em relação ao fundo de escala do conversor). Calibrar é dizer quantos pascais
          correspondem a esse fundo de escala; a partir daí, os níveis passam a ser <strong>dB SPL</strong> <Cite ids={['iso1683']} />. Abra a calibração com o microfone fechado,
          em <K>Calibração do microfone</K>.
        </P>
        <P><strong>Com calibrador acústico</strong> (o caminho recomendado). Um calibrador emite um tom de nível conhecido, em geral 94 dB (1 Pa) ou 114 dB, a 1 kHz
          <Cite ids={['iec60942']} />:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li>Encaixe o calibrador no microfone e ligue-o. O assistente mostra o nível ao vivo e orienta se está baixo ou saturando.</li>
          <li>Em 5 s, o PySQA mede o tom: ele procura a frequência exata do tom (com janela de Hann <Cite ids={['harris1978']} />) e mede só a energia dele, ignorando ruído e zumbido.</li>
          <li>Compara com o nível do calibrador e calcula a pressão do fundo de escala e a sensibilidade em mV/Pa.</li>
        </ol>
        <Eq n={2} where={<>p<sub>cal</sub>: pressão eficaz do calibrador; a<sub>RMS</sub>: valor eficaz do tom medido em unidades de fundo de escala (1,0 = fundo de escala).</>}>
          p<sub>FS</sub> [Pa] = p<sub>cal</sub> / a<sub>RMS</sub> , sensibilidade [mV/Pa] = 1000 / p<sub>FS</sub>
        </Eq>
        <Figure n={5} title="Calculadora de calibração. Mude o nível medido e veja a sensibilidade que o PySQA obteria."
          source="PySQA (simulação nesta página)."
          note="Exemplo: um calibrador de 94 dB lido a −23 dBFS dá cerca de 14,2 Pa no fundo de escala e 70,6 mV/Pa.">
          <CalibrationDemo />
        </Figure>
        <P>
          <strong>Sensibilidade conhecida:</strong> se você sabe a sensibilidade do microfone (da ficha técnica), digite-a na aba correspondente do assistente.
        </P>
        <UL>
          <li>A calibração fica guardada <strong>no seu navegador</strong>, para aquele microfone. Ela vale enquanto o ganho de entrada não mudar.</li>
          <li>O assistente avisa quando o tom está saturado, baixo demais, na frequência errada ou misturado com muito ruído; saturação e nível muito baixo impedem salvar.</li>
          <li>Takes gravados com microfone calibrado carregam a calibração. Ao enviá-los ao Post-Processing, ela é aplicada ao arquivo automaticamente (“xx mV/Pa ✓”), e a lista marca <em>calibrated</em>.</li>
          <li>O CSV exportado traz uma linha <K># Calibration:</K> com a pressão do fundo de escala.</li>
        </UL>
      </Section>

      <Section id="nivel" title="Medidores de nível">
        <Section id="n-vu" title="Medidor de nível (VU)" level={3}>
          <P>
            A barra horizontal mostra o <strong>pico</strong> e o valor <strong>eficaz (RMS)</strong> do sinal de −60 a 0 dBFS, com uma marca de pico que
            fica ~0,6 s antes de cair. O indicador <K>CLIP</K> acende quando uma amostra chega ao fundo de escala (1,0): daí em diante a forma de onda está cortada
            e a medição, comprometida.
          </P>
        </Section>

        <Section id="n-spl" title="Medidor de nível sonoro" level={3}>
          <P>
            Na barra superior, o medidor mostra, em dB SPL se o microfone está calibrado (em dBFS caso contrário):
          </P>
          <UL>
            <li><strong>Nível com ponderação temporal Fast:</strong> o nível “instantâneo”, suavizado com constante de tempo de 125 ms <Cite ids={['iec61672']} />.</li>
            <li><strong>Leq:</strong> o nível equivalente, a média de energia desde que o monitoramento começou (ou desde o início do take).</li>
            <li><strong>Máx.:</strong> o maior valor Fast.</li>
            <li><strong>Pico:</strong> o maior valor de pico, sem suavização.</li>
          </UL>
          <P>
            Os botões <K>A</K> e <K>Z</K> escolhem a ponderação em frequência: A (a curva dos medidores de nível sonoro, dB(A), veja a Figura 7 da
            documentação do <Link to="/docs/post-processing" className="text-teal underline">Post-Processing</Link>) ou Z (nenhuma). O filtro A é projetado para a taxa de amostragem em uso e fica a
            menos de 0,8 dB da norma até 10 kHz. <K>Zerar</K> reinicia o Leq e o máximo.
          </P>
          <Figure n={6} title="Resposta do medidor a uma rajada de 1 s a 94 dB sobre um fundo de 40 dB."
            source="PySQA (simulação nesta página)."
            note="O nível Fast sobe e desce com a constante de 125 ms; o Slow (1 s), mostrado só para comparação, reage mais devagar. O Leq do trecho resume toda a energia em um número.">
            <FastDemo />
          </Figure>
          <Callout kind="info">
            A norma de medidores de nível sonoro <Cite ids={['iec61672']} /> define precisão e testes que um aplicativo de navegador não cumpre. Este medidor serve para
            acompanhar a gravação e ajustar o ganho, e não substitui um medidor de classe 1 ou 2 quando a norma exige.
          </Callout>
        </Section>
      </Section>

      <Section id="protecao" title="Proteção do sinal">
        <UL>
          <li>
            <strong>Abortar por sobrecarga</strong> (padrão −6 dBFS, ajustável de −20 a 0): se o sinal ultrapassar esse nível durante a gravação, o take é descartado, porque
            um sinal saturado dá medições erradas.
          </li>
          <li>
            <strong>Parar no silêncio</strong> (padrão 2 s, de 0,5 a 30 s): termina a gravação depois de passar esse tempo com o sinal abaixo de −50 dBFS. Vale em qualquer modo de captura.
          </li>
        </UL>
      </Section>

      <Section id="ao-vivo" title="Gráficos ao vivo e revisão">
        <UL>
          <li><strong>Forma de onda ao vivo:</strong> os últimos 3 segundos, mostrando o mínimo e o máximo de cada coluna de pixels, para que picos curtos e saturação (em laranja) apareçam. Ela preenche enquanto a gravação corre.</li>
          <li><strong>Espectro ao vivo:</strong> FFT de 4 096 pontos, de 20 Hz até a frequência de Nyquist, em escala logarítmica, de −90 a 0 dBFS. Com <K>Média</K> marcado, ele acumula a média de energia dos quadros: é o jeito de enxergar o piso de ruído de um som contínuo.</li>
          <li><strong>Revisão:</strong> ao parar, o take aparece com a forma de onda completa, o espectro e um botão de reprodução com cursor. Só depois do <K>Aceitar</K> ele entra na lista.</li>
        </UL>
      </Section>

      <Section id="gravacoes" title="Gravações guardadas">
        <P>
          Os takes aceitos ficam na lista <K>Gravações</K>, <strong>guardados no próprio navegador</strong> (banco de dados local, IndexedDB). Eles sobrevivem a recarregar a página e a reiniciar o navegador, mas
          não saem do seu computador e podem ser apagados se você limpar os dados do site. Para cada take:
        </P>
        <UL>
          <li><strong>Reproduzir</strong> e ver forma de onda e espectro (clique no nome).</li>
          <li><strong>WAV:</strong> baixa o arquivo gravado, sem perdas, no formato escolhido (16 bits ou 32 bits flutuante).</li>
          <li><strong>CSV:</strong> tabela tempo × amplitude, com um cabeçalho que registra dispositivo, data, modo, taxa, bits, duração e calibração. Acima de 500 mil amostras, a exportação reduz a densidade e avisa.</li>
          <li><strong>Enviar ao Post-Processing:</strong> envia o WAV ao servidor para análise e, se o take é calibrado, já aplica a calibração.</li>
          <li><strong>Apagar:</strong> pede confirmação.</li>
        </UL>
      </Section>

      <Section id="motor" title="Como a captura funciona por dentro">
        <P>
          O PySQA usa a <strong>Web Audio API</strong> <Cite ids={['w3cwebaudio']} />. O áudio do microfone passa por um <em>AudioWorklet</em>, um pequeno programa que roda na thread de
          áudio do navegador e recebe os números originais (ponto flutuante, sem compressão). Ele conta amostras, aplica a pré-gravação e as regras de parada
          e calcula o nível a cada 50 ms. A etiqueta <K>Worklet</K> no topo indica que esse caminho está ativo.
        </P>
        <Callout kind="warn" title="Se a etiqueta mostrar “MediaRec”">
          O AudioWorklet exige uma página segura (https ou localhost). Sem ele, o PySQA usa o <em>MediaRecorder</em> do navegador, que guarda o som comprimido
          (com perdas) e controla a duração por cronômetro. Serve para gravar, mas <strong>não é adequado para medições</strong>. Abra o PySQA por https.
        </Callout>
      </Section>

      <Section id="limites" title="Limites e boas práticas">
        <UL>
          <li><strong>Calibre antes de medir</strong> e não mexa no ganho depois.</li>
          <li><strong>Deixe folga:</strong> prefira picos entre −20 e −6 dBFS. O 32 bits flutuante perdoa um nível baixo; o 16 bits não perdoa saturação.</li>
          <li><strong>Microfone de computador não é de medição.</strong> Os de notebook e celular têm resposta irregular e controles internos. Para medir, use um microfone de medição ligado a uma interface de áudio.</li>
          <li><strong>Um canal por vez</strong> e uma taxa de amostragem por take.</li>
          <li><strong>Seus takes ficam só no navegador</strong> até você enviá-los. Baixe os importantes.</li>
          <li><strong>Silêncio ao redor</strong> durante a calibração: ruído alto reduz a pureza do tom e o assistente avisa.</li>
        </UL>
      </Section>

      <Section id="referencias" title="Referências">
        <Bibliography />
      </Section>
    </article>
  )
}

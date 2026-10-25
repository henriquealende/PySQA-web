import { Bibliography, Callout, Cite, Eq, K, P, Section, Table, UL } from './ui'

export default function AuralizationDoc() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Preparação de áudios</h1>
        <P>
          Esta página prepara um som para um teste de escuta. Você envia uma gravação, escolhe de que direção ela deve parecer vir e ouve o resultado no
          fone de ouvido. O arquivo final é estéreo e pode ser analisado no Pós-processamento como qualquer outro.
        </P>
        <Callout kind="info" title="Nesta primeira versão">
          A cadeia tem seis blocos: Fonte, Ambiente, HRTF, Ruído, Fone e Nível. Funcionam agora <strong>Fonte</strong>, <strong>Ambiente</strong> (você envia a resposta ao impulso da
          sala, do carro ou do avião) <strong>HRTF</strong> e <strong>Ruído</strong> de fundo. Os <strong>Cenários rápidos</strong> montam tudo isso de uma vez. O bloco <strong>Fone</strong> (compensar ou simular um fone medido) age sobre o resultado final; o bloco <strong>Nível</strong> fecha a cadeia.
        </Callout>
      </header>

      <Section id="visao-geral" title="Visão geral">
        <P>A página segue <strong>três passos</strong>, indicados no topo. Cada passo marcado como feito pode ser reaberto com um clique.</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Áudio:</strong> envie um WAV na caixa de arrastar e soltar e selecione-o em <K>Som de origem</K>. Enquanto não há áudio, a página só mostra essa caixa.</li>
          <li><strong>Cenário:</strong> escolha cozinha, sala de estar, cabine de carro ou de avião para começar de um ponto realista, ou <K>Sem cenário</K> para partir do zero. <K>Construir minha sala</K> abre o Auralize Salas.</li>
          <li><strong>Ouvir e gerar:</strong> a barra fixa no rodapé toca o resultado, alterna entre <K>Processado</K> e <K>Original</K> sem perder o ponto da reprodução e tem o botão <K>Gerar arquivo estéreo</K>. Ele processa o arquivo inteiro e o coloca na sua lista; depois, <K>Abrir no Pós-processamento</K> ou <K>Baixar WAV</K>.</li>
        </ol>
        <P>
          Os ajustes finos ficam em <K>Configurações (opcional)</K>, fechadas por padrão. Cada cartão mostra, em uma linha, o que está definido (por exemplo, “Cabine de carro”, “Marrom · 12 dB”) e <K>Ajustar</K> abre as abas
          <K>Ambiente</K> (respostas ao impulso de sala, seção Ambiente), <K>Direção do som</K> (HRTF, azimute, elevação e distância: clique no mapa ou use os controles), <K>Ruído</K>, <K>Fone</K> e <K>Nível</K>.
          Escolher um cenário já preenche essas abas, e você pode alterar o que quiser depois. <K>Recolher</K> fecha as configurações.
        </P>
        <P>
          O arquivo final é estéreo. Em telas estreitas (celular) a barra do rodapé fica mais compacta: o aviso sobre fones de ouvido some dela, mas continua valendo.
        </P>
      </Section>

      <Section id="hrtf" title="Como o som ganha direção">
        <P>
          Ouvimos de que lado vem um som por duas pistas principais <Cite ids={['blauert1997']} />: o som chega <strong>antes</strong> à orelha mais próxima
          (diferença interaural de tempo, ITD) e chega <strong>mais forte</strong>, sobretudo nas frequências altas, porque a cabeça faz sombra para a outra
          orelha (diferença interaural de nível, ILD). A HRTF reúne essas pistas, mais o efeito da orelha externa, em uma resposta ao impulso para cada orelha e
          cada direção. Convolver o som com o par de respostas dá a ele aquela direção.
        </P>
        <P><strong>Convenção do PySQA:</strong> azimute 0° é à frente do ouvinte, positivo à direita (−90° é a esquerda, 180° é atrás); elevação positiva é para cima.</P>
        <Callout kind="warn" title="Arquivos SOFA usam outro sinal">
          O formato SOFA <Cite ids={['majdak2013']} /> conta o azimute para a esquerda. O PySQA inverte o sinal ao ler o arquivo, então o mapa e os controles
          seguem sempre a convenção acima.
        </Callout>

        <h3 className="text-base font-semibold text-white mt-2">O modelo de cabeça esférica</h3>
        <P>
          É o conjunto que já vem com o PySQA, para você experimentar sem baixar nada. Ele combina o atraso de Woodworth <Cite ids={['woodworth1954']} /> com o
          filtro de sombra da cabeça de Brown e Duda <Cite ids={['brown1998']} />. É um modelo didático: <strong>não tem orelha externa</strong>, então não
          reproduz a elevação nem distingue frente de trás como uma HRTF medida.
        </P>
        <Eq n={1} where={<>onde a é o raio da cabeça (0,0875 m), c é a velocidade do som (343 m/s) e θ é o ângulo da fonte em relação ao plano médio, em radianos.</>}>
          ITD = (a / c) · ( |θ| + sen |θ| )
        </Eq>
        <Table
          head={['Azimute', 'ITD teórico (Equação 1)', 'Observação']}
          widths={['20%', '30%', '50%']}
          rows={[
            ['0° (à frente)', '0 ms', 'As duas orelhas recebem o mesmo sinal'],
            ['30°', '0,26 ms', 'O PySQA mostra o valor medido na resposta, com resolução de 0,02 ms (a 48 kHz)'],
            ['60°', '0,49 ms', ''],
            ['90° (à direita)', '0,66 ms', 'Máximo do modelo; a orelha esquerda fica na sombra acima de poucos kHz'],
          ]}
        />

        <h3 className="text-base font-semibold text-white mt-2">HRTFs medidas (arquivos SOFA)</h3>
        <P>
          Conjuntos medidos em pessoas ou em manequins são mais realistas. O PySQA lê arquivos do tipo <K>SimpleFreeFieldHRIR</K> (duas orelhas) e usa a
          <strong> direção medida mais próxima</strong> da que você pediu, sem interpolar; se ela estiver longe, o resultado avisa qual direção foi usada.
          Se a taxa de amostragem do arquivo SOFA for diferente da sua gravação, as respostas são reamostradas e o atraso entre as orelhas é preservado.
          Se o arquivo traz o campo <K>Data.Delay</K>, o atraso é aplicado.
        </P>
        <Table
          head={['Conjunto', 'Licença', 'Situação']}
          widths={['34%', '30%', '36%']}
          rows={[
            [<>SADIE II <Cite ids={['kearney2024']} /></>, 'Apache 2.0', 'Confirmada. 20 sujeitos, SOFA.'],
            [<>ARI <Cite ids={['ari']} /></>, 'CC BY-SA 3.0', 'Confirmada. Derivados herdam a licença.'],
            [<>CIPIC <Cite ids={['algazi2001']} /></>, 'Domínio público (anúncio de 2001)', 'A confirmar: a página de download não abriu na conferência.'],
          ]}
        />
        <P>Os links de origem de cada conjunto estão nas referências, ao final desta página. Cite o conjunto que você usar.</P>
      </Section>

      <Section id="distancia" title="Distância e nível">
        <P>
          A distância muda <strong>só o nível</strong>, pela lei do inverso da distância, tomando 1 m como referência: 2 m dão −6 dB. O PySQA ainda não
          altera o timbre com a distância nem adiciona reverberação (isso virá com o bloco Ambiente).
        </P>
        <Eq n={2}>ganho [dB] = −20 · log₁₀( d / 1 m )</Eq>
        <P>
          O arquivo gerado é WAV de 32 bits em ponto flutuante, então um pico acima de 0 dBFS <strong>é guardado sem cortar</strong>. Mas o fone toca no
          máximo até 0 dBFS: se o aviso de pico aparecer, reduza o nível da fonte ou aumente a distância.
        </P>
        <Callout kind="warn" title="O nível real depende do seu equipamento">
          O PySQA não conhece o ganho do seu fone nem da sua placa de som. O resultado serve para comparar sons entre si na mesma cadeia; ele não garante um
          nível em dB SPL no ouvido. A calibração em mV/Pa do microfone da gravação original <strong>não</strong> é levada para o arquivo gerado.
        </Callout>
      </Section>

            <Section id="ambiente" title="Ambiente: a sala no som">
        <P>
          A <strong>resposta ao impulso</strong> de uma sala (RIR) é o que você ouviria se alguém batesse uma palma curtíssima ali: o som direto, as primeiras
          reflexões e a reverberação que vai sumindo. Convolver o seu áudio com ela coloca o som dentro da sala. Em <K>Ambiente</K> escolha o tipo e envie um
          WAV com <K>Enviar WAV</K>:
        </P>
        <Table
          head={['Tipo', 'Arquivo', 'O que o PySQA faz']}
          widths={['24%', '26%', '50%']}
          rows={[
            ['Sem ambiente', '—', 'Só o bloco HRTF (campo livre).'],
            ['Sala (RIR)', 'WAV de 1 canal', 'O som direto passa pela HRTF da direção escolhida. A reverberação, a partir de 2,5 ms depois do som direto, é aplicada com uma versão diferente para cada orelha.'],
            ['Binaural (BRIR)', 'WAV de 2 canais (esquerda e direita)', 'Aplica o canal de cada orelha. A BRIR já inclui a cabeça, então o bloco HRTF é ignorado.'],
          ]}
        />
        <Callout kind="info" title="Uma simplificação a conhecer">
          Na RIR de 1 canal, as primeiras reflexões <strong>não são posicionadas no espaço</strong>: depois do som direto, a sala soa difusa. Para reflexões
          com direção, use uma BRIR medida. Para tornar as duas orelhas diferentes, o PySQA usa um filtro passa-tudo de fase aleatória (10 ms), que mantém o
          espectro e o decaimento.
        </Callout>
        <P><strong>Nível:</strong> a sala não deixa o som mais alto. O PySQA escala o filtro para que a energia total seja a mesma da cabeça sozinha, de modo que o
          ambiente só redistribui a energia entre o som direto e a reverberação. O controle <K>Reverberação</K> (−30 a +10 dB) muda só o que vem depois do som direto.</P>

        <h3 className="text-base font-semibold text-white mt-2">Parâmetros acústicos da resposta</h3>
        <P>
          Ao enviar o arquivo, o PySQA calcula, pela norma ISO 3382 <Cite ids={['iso33821', 'iso33822']} />, os parâmetros abaixo, a partir da curva de decaimento de
          energia de Schroeder <Cite ids={['schroeder1965']} />. A contagem começa no pico da resposta (o som direto) e o ruído de fundo é estimado no final do
          arquivo e descontado.
        </P>
        <Eq n={3} where={<>onde h(t) é a resposta ao impulso e EDC(t) a energia que ainda resta depois do instante t. O tempo de reverberação vem da inclinação dessa curva em dB.</>}>
          EDC(t) = ∫<sub>t</sub><sup>∞</sup> h²(τ) dτ
        </Eq>
        <Eq n={4} where={<>t<sub>e</sub> = 50 ms (C50, para a fala) ou 80 ms (C80, para a música).</>}>
          C<sub>te</sub> = 10 · log₁₀( ∫<sub>0</sub><sup>te</sup> h² dt / ∫<sub>te</sub><sup>∞</sup> h² dt )
        </Eq>
        <Eq n={5}>
          D50 = 100 · ∫<sub>0</sub><sup>50 ms</sup> h² dt / ∫<sub>0</sub><sup>∞</sup> h² dt   [%]
        </Eq>
        <Table
          head={['Parâmetro', 'O que mede', 'Como o PySQA calcula']}
          widths={['16%', '40%', '44%']}
          rows={[
            ['T20', 'Tempo de reverberação (queda de 60 dB)', 'Reta ajustada à curva entre −5 e −25 dB, extrapolada para 60 dB'],
            ['T30', 'Idem, com mais faixa', 'Entre −5 e −35 dB'],
            ['EDT', 'Decaimento inicial, o que mais pesa na sensação de reverberação', 'Entre 0 e −10 dB'],
            ['C50, C80', 'Clareza: energia inicial contra a tardia', 'Equação 4, em dB'],
            ['D50', 'Definição: parcela da energia nos primeiros 50 ms', 'Equação 5, em %'],
            ['T20 por banda', 'Como a sala soa em cada região de frequência', 'Oitavas de 125 Hz a 4 kHz (filtro Butterworth de 4ª ordem, sem defasagem)'],
          ]}
        />
        <P>
          Quando a resposta é curta demais ou o ruído de fundo cobre o decaimento, o parâmetro aparece como “—”: o PySQA não inventa um valor.
          Um número muito diferente entre T20 e T30 também avisa que o decaimento não é uma reta, o que é comum em salas pequenas.
        </P>

        <h3 className="text-base font-semibold text-white mt-2">Onde achar respostas de sala de uso livre</h3>
        <Table
          head={['Conjunto', 'Licença', 'Observação']}
          widths={['32%', '24%', '44%']}
          rows={[
            [<>McVAMPIRE (cabine de minivan) <Cite ids={['muller2024']} /></>, 'CC BY 4.0', 'Confirmada. 14 microfones por posição: escolha um canal e salve como WAV de 1 canal.'],
            [<>dEchorate (sala retangular) <Cite ids={['dicarlo2021']} /></>, 'CC BY 4.0', 'Confirmada. Sala de laboratório, várias condições de paredes.'],
            [<>BUT ReverbDB <Cite ids={['szoke2019']} /></>, 'CC BY 4.0', 'Confirmada. A parte de fala retransmitida exige licença à parte.'],
            [<>IR64-CAR (carro, 64 canais) <Cite ids={['lopezballester2025']} /></>, 'CC BY 4.0', 'Confirmada, mas tem 64 canais: reduza a 1 ou 2 canais antes de enviar.'],
            [<>OpenAIR <Cite ids={['murphy2010']} /></>, 'Por item', 'Leia a licença de cada item.'],
            [<>eBrIRD (cozinha) <Cite ids={['ebrird']} /></>, 'A confirmar', 'O site não abriu na conferência.'],
            [<>AIR de Aachen <Cite ids={['jeub2009']} /></>, 'A confirmar', 'O site não abriu na conferência.'],
          ]}
        />
        <P>O PySQA aceita WAV de 1 ou 2 canais, de até 30 s, e converte a taxa de amostragem para a do seu áudio quando são diferentes.</P>
      </Section>

            <Section id="cenarios" title="Cenários rápidos e ruído de fundo">
        <P>
          Um <strong>cenário</strong> monta, com um clique, uma sala sintética, a posição do som e o ruído de fundo. Depois você ajusta cada bloco como quiser
          (ou escolhe <K>Sem cenário</K> para limpar tudo). Servem para ter um ponto de partida realista, por exemplo uma geladeira numa cozinha ou um aviso
          sonoro numa cabine.
        </P>
        <Table
          head={['Cenário', 'Sala (volume; fonte a)', 'T20 por banda, 125 Hz a 4 kHz [s]', 'Ruído de fundo']}
          widths={['18%', '24%', '34%', '24%']}
          rows={[
            ['Cozinha', '30 m³; 2 m', '0,60 · 0,55 · 0,50 · 0,50 · 0,45 · 0,40', 'Nenhum'],
            ['Sala de estar', '45 m³; 2,5 m', '0,59 · 0,55 · 0,50 · 0,47 · 0,43 · 0,41', 'Nenhum'],
            ['Cabine de carro', '3 m³; 0,8 m', '0,12 · 0,09 · 0,07 · 0,06 · 0,05 · 0,045', 'Marrom, relação sinal-ruído de 12 dB'],
            ['Cabine de avião', '80 m³; 1,5 m', '0,30 · 0,25 · 0,20 · 0,18 · 0,15 · 0,12', 'Rosa, relação sinal-ruído de 8 dB'],
          ]}
        />
        <Callout kind="warn" title="Não são medições">
          Estes valores são <strong>pontos de partida escolhidos pelo PySQA</strong> a partir de ordens de grandeza usuais para cada tipo de espaço. Não vêm de
          uma tabela publicada nem representam um local ou um veículo específico. Para um estudo, ajuste-os ao seu caso e descreva-os no método, ou use uma
          resposta ao impulso medida (seção Ambiente).
        </Callout>

        <h3 className="text-base font-semibold text-white mt-2">Como a sala sintética é feita</h3>
        <P>
          O PySQA gera uma resposta com um impulso (o som direto, no instante que o som leva para percorrer a distância) seguido de uma cauda de ruído que decai
          com o tempo de reverberação de cada banda de oitava. A força da cauda em relação ao som direto vem da distância crítica <Cite ids={['kuttruff2009']} />,
          a distância em que a energia direta e a reverberante se igualam.
        </P>
        <Eq n={6} where={<>onde V é o volume da sala (m³) e T o tempo de reverberação a 1 kHz (s).</>}>
          D<sub>c</sub> = 0,057 · √( V / T )
        </Eq>
        <Eq n={7} where={<>com a fonte a uma distância r. Perto da fonte (r &lt; D<sub>c</sub>) o som direto domina; longe dela, a reverberação.</>}>
          E<sub>reverberante</sub> / E<sub>direta</sub> = ( r / D<sub>c</sub> )²
        </Eq>
        <Callout kind="info" title="O que este modelo não tem">
          É um modelo estatístico: <strong>não há reflexões individuais</strong> nem modos da sala. Abaixo da frequência de Schroeder, estimada por
          f<sub>S</sub> ≈ 2000 · √( T / V ) <Cite ids={['kuttruff2009']} />, uma sala pequena não se comporta como um campo difuso: isso dá cerca de 260 Hz na cozinha e
          300 Hz no carro. Nessa região a resposta real tem ressonâncias que o modelo não reproduz. Em uma sala pequena, o T20 de banda larga mostrado fica perto
          do das bandas mais altas, que concentram a energia.
        </Callout>
        <P>
          Com um cenário, a distância do bloco HRTF fica em 1 m: a distância da fonte já entra na razão entre som direto e reverberação da sala, e somá-la
          ao bloco HRTF atenuaria o som direto duas vezes.
        </P>

        <h3 className="text-base font-semibold text-white mt-2">Ruído de fundo</h3>
        <P>
          O bloco <K>Ruído de fundo</K> soma um ruído contínuo, <strong>diferente em cada orelha</strong>, com a relação sinal-ruído (SNR) escolhida. A
          cor do ruído define o espectro:
        </P>
        <Table
          head={['Cor', 'Espectro de potência', 'Uso típico']}
          widths={['20%', '30%', '50%']}
          rows={[
            ['Branco', 'Igual em todas as frequências', 'Chiado, referência'],
            ['Rosa', 'Cai 3 dB por oitava', 'Ruído de banda larga, como o de uma cabine em cruzeiro'],
            ['Marrom', 'Cai 6 dB por oitava', 'Ruído dominado pelo grave, como o de rodagem de um carro'],
          ]}
        />
        <P>
          A SNR é a razão entre o valor RMS do sinal e o do ruído, calculados sobre o <strong>arquivo inteiro e as duas orelhas</strong>, com os trechos de
          silêncio incluídos. O ruído é gerado com semente fixa: a mesma configuração dá sempre o mesmo arquivo. Os tipos de ruído são sintéticos; não são
          gravações de carros ou aviões. O gráfico do bloco mostra, em bandas de 1/3 de oitava, o sinal (já na sala e na posição escolhidas) e as três cores de ruído na SNR escolhida, para ler a relação banda a banda: em bandas de 1/3 de oitava o ruído branco sobe 3 dB por oitava, o rosa é plano e o marrom cai 3 dB por oitava.
        </P>
      </Section>

      <Section id="fone" title="Fone de ouvido">
        <P>
          O bloco <strong>Fone</strong> age sobre o resultado (sala, posição e ruído). Você envia a medição de um fone, um CSV com a
          frequência em Hz e o nível em dB, e escolhe o que fazer com ela:
        </P>
        <Table
          head={['Modo', 'O que o filtro faz', 'Quando usar']}
          widths={['24%', '40%', '36%']}
          rows={[
            ['Sem correção', 'Nada.', 'Quando o estímulo será tocado como está.'],
            ['Compensar o fone', 'Aplica o inverso da resposta medida, para que o fone soe plano.', 'Para o ouvinte receber o estímulo como foi preparado.'],
            ['Simular o fone', 'Aplica a própria resposta do fone.', 'Para ouvir ou analisar um som como aquele fone o reproduziria.'],
          ]}
        />
        <Eq n={8} where={<>onde M(f) é a resposta medida em dB, suavizada em 1/6 de oitava e com média 0 dB entre 200 Hz e 4 kHz, e G<sub>máx</sub> é o reforço máximo (12 dB por padrão).</>}>
          C(f) = mín( −M(f) , G<sub>máx</sub> )   [dB]
        </Eq>
        <P>
          A correção é <strong>limitada</strong>: reforçar uma cava profunda custa muita energia e quase sempre vem de uma medição ruidosa, então o reforço tem teto e só os
          cortes são livres. Ela também some suavemente abaixo de 60 Hz e perto do topo da faixa. A média entre 200 Hz e 4 kHz fica em 0 dB: o filtro muda o formato do
          espectro, não o nível geral. O filtro é de <strong>fase mínima</strong> (2048 amostras), construído a partir do módulo da resposta pelo cepstro
          <Cite ids={['oppenheim2010']} />: não cria pré-eco, e a fase da resposta real do fone não é usada.
        </P>
        <Callout kind="warn" title="Vale para o fone que foi medido">
          A resposta de um fone muda de um exemplar para outro e com o assentamento nas orelhas. A compensação corrige a <strong>medição que você enviou</strong>, não o seu
          fone em uso. A medição de um cabeça artificial não é a resposta no ouvido de uma pessoa.
        </Callout>
        <P>
          O PySQA aceita CSV ou TXT com cabeçalho opcional, separado por vírgula, ponto e vírgula (com vírgula decimal) ou tabulação, cobrindo ao menos 200 Hz a 8 kHz. Se houver
          várias colunas, usa a chamada <K>raw</K> e, na falta dela, a <K>smoothed</K>. O arquivo precisa ter entre 8 e 20 000 linhas.
        </P>
        <h3 className="text-base font-semibold text-white mt-2">Biblioteca embutida (SBAF)</h3>
        <P>
          O PySQA traz <strong>100 modelos de fone</strong> (122 entradas, uma por acoplador de medição) da base do SBAF <Cite ids={['sbaf']} />, publicada com licença CC BY 4.0. Escolha um
          em <K>Arquivo</K> (use o campo de filtro para achar a marca ou o modelo); a atribuição aparece na tela. Os arquivos são os originais, sem alteração, e ficam na pasta
          <K>backend/data/headphones/sbaf</K> com um aviso de origem, de licença e do commit.
        </P>
        <Callout kind="warn" title="Leia antes de usar a biblioteca">
          <ul className="list-disc pl-4 flex flex-col gap-1">
            <li>As medições <strong>já vêm compensadas pela curva SBAF</strong> (uma reta é tida como “neutra”), não são medições brutas e <strong>não são a curva Harman</strong>. Compensar leva o fone a essa resposta neutra.</li>
            <li>A maioria dos modelos é de linha <strong>hi-fi</strong> (Sennheiser HD600 e HD800, Focal, Audeze, HiFiMan, AKG K7XX, Grado, ZMF…); há poucos fones comuns de consumo. A fonte não é atualizada desde julho de 2021.</li>
            <li>Há três tipos de acoplador: <strong>placa plana</strong> (sem orelha externa, 91 entradas) e <strong>miniDSP EARS</strong> (com orelha, 31 entradas). Não compare números de acopladores diferentes.</li>
            <li>Os dois canais (esquerdo e direito) são somados em média, em dB; 17 entradas têm só um canal. Uma medição é de um exemplar do fone, não do modelo em geral.</li>
            <li>A licença CC BY 4.0 consta no README do repositório; o GitHub não mostra um arquivo LICENSE separado.</li>
          </ul>
        </Callout>
        <Table
          head={['Origem das medições', 'Licença', 'Situação']}
          widths={['34%', '30%', '36%']}
          rows={[
            [<>SBAF <Cite ids={['sbaf']} /></>, 'CC BY 4.0', 'Confirmada e embutida (100 modelos). Duas colunas (Hz, dB) separadas por espaço, sem cabeçalho, suavizadas em 1/6 de oitava e normalizadas em 500 a 1500 Hz; um arquivo por canal; medidas em um miniDSP EARS ou num acoplador de placa plana. O PySQA também lê esse formato nos seus arquivos.'],
            [<>COAT <Cite ids={['coat']} /></>, 'CC BY 4.0', 'Confirmada. Funções de transferência de fone medidas no ouvido de 27 pessoas (DT770 Pro, HD650 e ER-4PT), em SOFA. O PySQA ainda não lê SOFA de fone.'],
            [<>OPRA <Cite ids={['opra']} /></>, 'Código MIT; dados CC BY-SA 4.0', 'Confirmada. Traz filtros de equalização, não a resposta medida: não alimenta este bloco diretamente.'],
            [<>AutoEq <Cite ids={['pasanen']} /></>, 'Código MIT; dados por fonte (oratory1990, crinacle, Rtings, InnerFidelity)', 'A confirmar, fonte por fonte: o README não diz nada sobre a licença das medições. Reúne também curvas-alvo, como a Harman.'],
            ['squig.link / CrinGraph, RTINGS', 'Por site; sem termos achados', 'A confirmar. Não achei download em lote oficial nem termos de uso.'],
          ]}
        />
        <P>
          Só a biblioteca SBAF vem embutida; das demais fontes, baixe o arquivo, confira a licença, cite a fonte no seu trabalho e envie o CSV. Todas essas bases medem
          em acoplador ou cabeça artificial, e o resultado depende do equipamento de medição: não compare números de bases diferentes sem checar isso.
        </P>
      </Section>

      <Section id="nivel" title="Nível de reprodução (dB SPL)">
        <P>
          Um arquivo de áudio guarda números entre −1 e 1, não pressão sonora. Para dizer que um estímulo toca a 60 dB SPL é preciso saber <strong>o quanto o seu
          equipamento amplifica</strong>, e o PySQA não tem como medir isso: você informa. O bloco <strong>Nível</strong> é o último passo e ajusta o ganho do arquivo
          para que ele chegue ao <strong>nível-alvo</strong> no seu equipamento.
        </P>
        <Eq n={9} where={<>onde ⟨x²⟩ é o valor quadrático médio do sinal (todas as amostras e as duas orelhas somadas em energia). Um seno em escala máxima lê 0 dB; um seno de amplitude 0,1 lê −20 dB.</>}>
          L<sub>d</sub> = 10 · log₁₀( ⟨x²⟩ / ½ )   [dB re seno em escala máxima]
        </Eq>
        <Eq n={10} where={<>onde L<sub>alvo</sub> é o nível-alvo em dB SPL e L<sub>FS</sub> é o nível, no seu ouvido, de um seno em escala máxima (0 dBFS) no seu fone e na sua placa de som. O nível resultante é L<sub>FS</sub> + L<sub>d</sub>.</>}>
          G = L<sub>alvo</sub> − L<sub>FS</sub> − L<sub>d</sub>   [dB]
        </Eq>
        <Table
          head={['Modo', 'O que define o nível-alvo']}
          widths={['30%', '70%']}
          rows={[
            ['Sem ajuste', 'Nada: o arquivo sai com o nível que tem.'],
            ['Nível-alvo', 'O valor que você escolhe (20 a 110 dB SPL).'],
            ['Manter o nível da gravação', 'O nível calibrado da gravação original, calculado a partir da calibração do microfone (mV/Pa, feita no Pós-processamento). Sem calibração, o modo fica bloqueado.'],
          ]}
        />
        <P>
          A ponderação <strong>A</strong> segue a IEC 61672-1 <Cite ids={['iec61672']} />, e <strong>Z</strong> é sem ponderação. O nível é um Leq do <strong>arquivo todo</strong>:
          inclui os trechos de silêncio, a cauda da sala e o ruído de fundo, e não é um nível com constante de tempo (Fast ou Slow).
        </P>
        <Callout kind="warn" title="É uma conta a partir do que você informa">
          O valor L<sub>FS</sub> é uma suposição sua, a menos que você o tenha medido com um ouvido artificial ou um acoplador. Sem essa medição, o nível real no ouvido pode ser outro, e
          comparar dois estímulos entre si continua valendo mais do que o número absoluto. Uma compensação de fone mantém o nível médio entre 200 Hz e 4 kHz, então ela não desfaz esse ajuste.
        </Callout>
        <P>
          Se o ganho levar o pico acima de 0 dBFS, o arquivo guarda o valor exato (32 bits em ponto flutuante), mas a reprodução satura: o resultado avisa. Reduza o nível-alvo ou use um
          equipamento mais sensível. A prévia calcula o ganho com os primeiros 12 s; o arquivo gerado usa o arquivo inteiro, então os dois podem diferir um pouco.
        </P>
      </Section>

      <Section id="sala-propria" title="Quer uma sala própria?">
        <P>
          Se a sala que você precisa não está nos cenários, o <strong>Auralize Salas</strong> (<a href="https://auralize.com.br/salas?utm_source=pysqa&utm_medium=app&utm_campaign=docs" target="_blank" rel="noopener noreferrer" className="text-teal underline">auralize.com.br/salas</a>),
          produto da mesma equipe, permite modelar a geometria, aplicar materiais e ler TR, C80, STI e a frequência de Schroeder. A resposta ao impulso exportada em WAV (1 ou 2 canais, até 30 s)
          entra no PySQA pelo bloco Ambiente, com <K>Enviar WAV</K>. O card “Da equipe Auralize”, na seção Ambiente, tem o vídeo de apresentação e pode ser fechado; o chip
          <K>Construir minha sala</K> nos Cenários rápidos o reabre.
        </P>
      </Section>

      <Section id="limites" title="Limites e boas práticas">
        <UL>
          <li><strong>Use fones de ouvido.</strong> Em caixas de som a sensação de direção se perde.</li>
          <li><strong>Fonte com mais de um canal:</strong> os canais são somados em um só antes do processamento.</li>
          <li><strong>A prévia usa os primeiros 12 s</strong> (com a cauda da sala). A versão <K>Original</K> toca o arquivo inteiro.</li>
          <li><strong>Arquivos SOFA, respostas de sala e medições de fone enviados ficam na memória do servidor</strong> e somem se ele reiniciar; o PySQA avisa e você envia de novo. Arquivos gerados só com o modelo de cabeça esférica são refeitos sozinhos; os gerados com SOFA, sala ou fone enviados, não.</li>
          <li><strong>No máximo 4 arquivos de cada tipo por sessão</strong> (4 SOFA, 4 respostas de sala e 4 medições de fone).</li>
          <li><strong>Respostas de sala:</strong> WAV de 1 ou 2 canais, até 30 s.</li>
          <li><strong>Cada pessoa ouve de um jeito.</strong> HRTFs de outra pessoa ou de manequim funcionam melhor para uns do que para outros; relate qual conjunto usou.</li>
        </UL>
      </Section>

      <Section id="referencias" title="Referências">
        <Bibliography />
      </Section>
    </article>
  )
}

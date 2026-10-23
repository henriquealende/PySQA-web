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
          A cadeia tem quatro blocos: Fonte, Ambiente, HRTF e Fone. Só os blocos <strong>Fonte</strong> e <strong>HRTF</strong> funcionam agora. Ambiente
          (reverberação de cozinha, cabine de carro ou de avião) e Fone (compensação da resposta do fone) aparecem como “Em breve”.
        </Callout>
      </header>

      <Section id="visao-geral" title="Visão geral">
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Escolha a fonte:</strong> envie um WAV na coluna da esquerda e selecione-o em <K>Som de origem</K>.</li>
          <li><strong>Escolha o conjunto de HRTF:</strong> o modelo de cabeça esférica, ou um arquivo <K>.sofa</K> seu (<K>Enviar SOFA</K>).</li>
          <li><strong>Posicione o som:</strong> clique no mapa ou use os controles de <K>Azimute</K>, <K>Elevação</K> e <K>Distância</K>.</li>
          <li><strong>Ouça:</strong> em <K>Ouvir e comparar</K>, alterne entre <K>Processado</K> e <K>Original</K> sem perder o ponto da reprodução.</li>
          <li><strong>Gere o arquivo:</strong> <K>Gerar arquivo estéreo</K> processa o arquivo inteiro e o coloca na sua lista. Depois, <K>Abrir no Pós-processamento</K> ou <K>Baixar WAV</K>.</li>
        </ol>
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
        <P>A lista no fim da página Preparação de áudios mostra o mesmo estado e os links de origem. Cite o conjunto que você usar.</P>
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

      <Section id="limites" title="Limites e boas práticas">
        <UL>
          <li><strong>Use fones de ouvido.</strong> Em caixas de som a sensação de direção se perde.</li>
          <li><strong>Fonte com mais de um canal:</strong> os canais são somados em um só antes do processamento.</li>
          <li><strong>A prévia usa os primeiros 12 s.</strong> A versão <K>Original</K> toca o arquivo inteiro.</li>
          <li><strong>Conjuntos SOFA enviados ficam na memória do servidor</strong> e somem se ele reiniciar; o PySQA avisa e você envia de novo. Arquivos gerados com o modelo de cabeça esférica são refeitos sozinhos; os gerados com SOFA enviado, não.</li>
          <li><strong>No máximo 4 conjuntos SOFA por sessão.</strong></li>
          <li><strong>Cada pessoa ouve de um jeito.</strong> HRTFs de outra pessoa ou de manequim funcionam melhor para uns do que para outros; relate qual conjunto usou.</li>
        </UL>
      </Section>

      <Section id="referencias" title="Referências">
        <Bibliography />
      </Section>
    </article>
  )
}

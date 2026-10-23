import { Link } from 'react-router-dom'
import { Callout, P, Section, UL } from './ui'
import { useLang } from '../../i18n'

export const ABOUT_TOC = {
  pt: [
    { id: 'jornada', title: 'A jornada' },
    { id: 'hoje', title: 'O PySQA hoje' },
    { id: 'agradecimentos', title: 'Agradecimentos' },
    { id: 'contribuir', title: 'Venha construir junto' },
    { id: 'contato', title: 'Contato' },
  ],
  en: [
    { id: 'jornada', title: 'The journey' },
    { id: 'hoje', title: 'PySQA today' },
    { id: 'agradecimentos', title: 'Acknowledgements' },
    { id: 'contribuir', title: 'Build it with us' },
    { id: 'contato', title: 'Contact' },
  ],
}

const EMAIL = 'henrique.alende@posgrad.ufsc.br'
const REPO = 'https://github.com/henriquealende/PySQA-web'

function Timeline({ items }: { items: { when: string; what: string }[] }) {
  return (
    <ol className="flex flex-col gap-0 max-w-[72ch] border-l border-border ml-2">
      {items.map((it, i) => (
        <li key={i} className="relative pl-6 pb-5 last:pb-0">
          <span className="absolute -left-[6px] top-1.5 w-3 h-3 rounded-full bg-teal border-2 border-dark" aria-hidden="true" />
          <p className="text-teal text-sm font-semibold">{it.when}</p>
          <p className="text-sm text-slate-200 leading-relaxed">{it.what}</p>
        </li>
      ))}
    </ol>
  )
}

const Mail = () => <a href={`mailto:${EMAIL}`} className="text-teal underline">{EMAIL}</a>
const Repo = () => <a href={REPO} target="_blank" rel="noreferrer" className="text-teal underline">github.com/henriquealende/PySQA-web</a>

function AboutPt() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Sobre o PySQA</h1>
        <P>Uma ferramenta de qualidade sonora que cresceu junto com uma pesquisa, e agora quer chegar a quem precisa dela.</P>
      </header>

      <Section id="jornada" title="A jornada">
        <P>
          Tudo começou em 2018, quando eu tentava entender como funcionam as interfaces gráficas. No dia em que consegui fazer um clique de botão escrever
          “Hello world!” na tela, fiquei eufórico. Era um protótipo em MATLAB, feito antes do doutorado, e a ideia era simples: ter uma ferramenta para calcular e
          comparar métricas de qualidade sonora sem refazer o mesmo script a cada ensaio.
        </P>
        <P>
          Durante o doutorado na UFSC, sob orientação do Prof. Erasmo Vergara, estudei a qualidade sonora de sinais impulsivos de refrigeradores, e a ferramenta
          cresceu junto com a pesquisa. Como eu estudava psicoacústica, ela se chamava <strong>Psychobox</strong>. Cada ideia que fazia sentido para o meu trabalho,
          ou que automatizava uma etapa repetitiva, virava funcionalidade. O PySQA foi usado nas análises da minha tese, defendida em 2024.
        </P>
        <P>
          No fim de 2021 veio a primeira grande mudança. Eu estava estudando Python e escolhi o Psychobox como cobaia: traduzi todos os códigos <code className="text-teal">.mat</code> para{' '}
          <code className="text-teal">.py</code> e comecei a construir a parte de aquisição de sinais. As métricas passaram a viver em Python, e o nome mudou junto:{' '}
          <strong>PySQA</strong>, de <em>Python</em> e <em>Sound Quality Analyzer</em>.
        </P>
        <Timeline items={[
          { when: '2018', what: 'Protótipo em MATLAB. O primeiro botão que escreve “Hello world!”.' },
          { when: 'Doutorado na UFSC', what: 'O Psychobox cresce com a pesquisa sobre sinais impulsivos de refrigeradores.' },
          { when: 'Fim de 2021', what: 'Tradução de .mat para .py e início da aquisição de sinais: nasce o PySQA.' },
          { when: '2024', what: 'Defesa da tese, com o PySQA nas análises.' },
          { when: 'Hoje', what: 'O PySQA no navegador, com documentação, aberto a quem quiser usar e contribuir.' },
        ]} />
      </Section>

      <Section id="hoje" title="O PySQA hoje">
        <P>
          Agora o PySQA chega ao navegador. A ideia é torná-lo acessível a quem precisa dele, sem instalação e sem cadastro, em três módulos:
        </P>
        <UL>
          <li><Link to="/data-acquisition" className="text-teal underline"><strong>Aquisição de dados</strong></Link>: grava pelo microfone, calibra em dB SPL, dispara a gravação por nível e mede o nível sonoro ao vivo.</li>
          <li><Link to="/post-processing" className="text-teal underline"><strong>Pós-processamento</strong></Link>: espectro, espectrograma, 1/3 de oitava, envelope e as métricas de qualidade sonora (loudness, sharpness, roughness, fluctuation strength, tonalidade e impulsividade), com análise em lote.</li>
          <li><Link to="/system-analysis" className="text-teal underline"><strong>Análise de sistemas</strong></Link>: funções de resposta em frequência, Bode, coerência, modos e amortecimento.</li>
        </UL>
        <P>
          Cada recurso está explicado nas páginas desta Documentação, com demonstrações gráficas e referências em ABNT:{' '}
          <Link to="/docs/data-acquisition" className="text-teal underline">Aquisição de dados</Link>,{' '}
          <Link to="/docs/post-processing" className="text-teal underline">Pós-processamento</Link> e{' '}
          <Link to="/docs/system-analysis" className="text-teal underline">Análise de sistemas</Link>.
        </P>
      </Section>

      <Section id="agradecimentos" title="Agradecimentos">
        <P>O PySQA só existe porque muita gente compartilha o que sabe. Agradeço:</P>
        <UL>
          <li>ao <strong>Prof. Erasmo Vergara</strong>, meu orientador, e ao <strong>Prof. Arcanjo Lenzi</strong>;</li>
          <li>à <strong>UFSC</strong>, ao <strong>POSMEC</strong> e ao <strong>LVA</strong>, onde a ferramenta cresceu;</li>
          <li>a <strong>Ricardo Brum</strong>, colega, pela amizade e pela contribuição na plataforma;</li>
          <li>a <strong>Jucélio Tavares</strong> e <strong>Taiana Barbosa</strong>, bolsistas neste projeto, pela dedicação;</li>
          <li>à comunidade da <strong>MoSQITo</strong> (Eomys Engineering e Green Forge Coop) e do <strong>Sottek Hearing Model</strong> (Mike Lotinga e Roland Sottek), cujas bibliotecas abertas sustentam boa parte dos cálculos;</li>
          <li>às comunidades do NumPy e do SciPy.</li>
        </UL>
      </Section>

      <Section id="contribuir" title="Venha construir junto">
        <P>Esta é uma ferramenta em crescimento, e o convite é para você crescer com ela. Há lugar para:</P>
        <UL>
          <li><strong>Código e novas métricas:</strong> implementar ou validar métricas, corrigir e melhorar.</li>
          <li><strong>Testes e validação:</strong> comparar os resultados com os seus dados, calibradores e outros softwares.</li>
          <li><strong>Documentação e tradução:</strong> revisar textos, acrescentar exemplos, traduzir.</li>
          <li><strong>Casos de uso:</strong> contar como você usa o PySQA no ensino, na indústria ou na pesquisa.</li>
        </UL>
        <P>O código está em <Repo />.</P>
        <Callout kind="tip" title="Encontrou algo estranho?">
          Um resultado que não bate, um botão confuso, um texto que não ficou claro: conte. É assim que a ferramenta melhora. Use o botão <strong>Reportar um bug</strong>, no fim da coluna da esquerda de qualquer página: o texto chega até nós junto com a tela, o arquivo aberto e o navegador (o áudio não é enviado).
        </Callout>
      </Section>

      <Section id="contato" title="Contato">
        <P>Henrique Alende da Silveira, Universidade Federal de Santa Catarina (UFSC).</P>
        <P>E-mail: <Mail /></P>
      </Section>
    </article>
  )
}

function AboutEn() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">About PySQA</h1>
        <P>A sound quality tool that grew alongside a research project, and now wants to reach the people who need it.</P>
      </header>

      <Section id="jornada" title="The journey">
        <P>
          It all began in 2018, when I was trying to understand how graphical interfaces work. The day I got a button click to write “Hello world!” on the
          screen, I was thrilled. It was a MATLAB prototype, built before my PhD, with a simple idea: a tool to calculate and compare sound quality metrics
          without rewriting the same script for every test.
        </P>
        <P>
          During my PhD at UFSC, supervised by Prof. Erasmo Vergara, I studied the sound quality of impulsive signals from refrigerators, and the tool grew along
          with the research. Since I was studying psychoacoustics, it was called <strong>Psychobox</strong>. Every idea that made sense for my work, or that
          automated a repetitive step, became a feature. PySQA was used in the analyses of my thesis, defended in 2024.
        </P>
        <P>
          At the end of 2021 came the first big change. I was learning Python and picked Psychobox as my guinea pig: I translated all the <code className="text-teal">.mat</code> code into{' '}
          <code className="text-teal">.py</code> and started building the signal acquisition side. The metrics now lived in Python, and the name changed with them:{' '}
          <strong>PySQA</strong>, for <em>Python</em> and <em>Sound Quality Analyzer</em>.
        </P>
        <Timeline items={[
          { when: '2018', what: 'MATLAB prototype. The first button that writes “Hello world!”.' },
          { when: 'PhD at UFSC', what: 'Psychobox grows with the research on impulsive sounds from refrigerators.' },
          { when: 'End of 2021', what: 'From .mat to .py and the start of signal acquisition: PySQA is born.' },
          { when: '2024', what: 'Thesis defense, with PySQA in the analyses.' },
          { when: 'Today', what: 'PySQA in the browser, with documentation, open to anyone who wants to use and contribute.' },
        ]} />
      </Section>

      <Section id="hoje" title="PySQA today">
        <P>
          Now PySQA comes to the browser. The idea is to make it accessible to the people who need it, with no installation and no sign-up, in three modules:
        </P>
        <UL>
          <li><Link to="/data-acquisition" className="text-teal underline"><strong>Data Acquisition</strong></Link>: records from the microphone, calibrates in dB SPL, triggers recording by level, and measures sound level live.</li>
          <li><Link to="/post-processing" className="text-teal underline"><strong>Post-Processing</strong></Link>: spectrum, spectrogram, 1/3-octave bands, envelope and sound quality metrics (loudness, sharpness, roughness, fluctuation strength, tonality and impulsiveness), with batch analysis.</li>
          <li><Link to="/system-analysis" className="text-teal underline"><strong>System Analysis</strong></Link>: frequency response functions, Bode plots, coherence, modes and damping.</li>
        </UL>
        <P>
          Every feature is explained in the pages of this Documentation, with graphical demonstrations and references (currently in Portuguese; the English version is in preparation):{' '}
          <Link to="/docs/data-acquisition" className="text-teal underline">Data Acquisition</Link>,{' '}
          <Link to="/docs/post-processing" className="text-teal underline">Post-Processing</Link> and{' '}
          <Link to="/docs/system-analysis" className="text-teal underline">System Analysis</Link>.
        </P>
      </Section>

      <Section id="agradecimentos" title="Acknowledgements">
        <P>PySQA exists because many people share what they know. My thanks go to:</P>
        <UL>
          <li><strong>Prof. Erasmo Vergara</strong>, my supervisor, and <strong>Prof. Arcanjo Lenzi</strong>;</li>
          <li><strong>UFSC</strong>, <strong>POSMEC</strong> and <strong>LVA</strong>, where the tool grew;</li>
          <li><strong>Ricardo Brum</strong>, a colleague, for the friendship and the contributions to the platform;</li>
          <li><strong>Jucélio Tavares</strong> and <strong>Taiana Barbosa</strong>, scholarship researchers on this project, for their dedication;</li>
          <li>the <strong>MoSQITo</strong> community (Eomys Engineering and Green Forge Coop) and the <strong>Sottek Hearing Model</strong> (Mike Lotinga and Roland Sottek), whose open libraries support a large part of the calculations;</li>
          <li>the NumPy and SciPy communities.</li>
        </UL>
      </Section>

      <Section id="contribuir" title="Build it with us">
        <P>This is a growing tool, and the invitation is to grow with it. There is room for:</P>
        <UL>
          <li><strong>Code and new metrics:</strong> implement or validate metrics, fix and improve.</li>
          <li><strong>Tests and validation:</strong> compare the results with your own data, calibrators and other software.</li>
          <li><strong>Documentation and translation:</strong> review texts, add examples, translate.</li>
          <li><strong>Use cases:</strong> tell us how you use PySQA in teaching, industry or research.</li>
        </UL>
        <P>The code is at <Repo />.</P>
        <Callout kind="tip" title="Found something odd?">
          A result that does not add up, a confusing button, a text that is not clear: tell us. That is how the tool gets better. Use the <strong>Report a bug</strong> button at the bottom of the left column on any page: your text reaches us together with the current page, the open file and your browser (the audio itself is not sent).
        </Callout>
      </Section>

      <Section id="contato" title="Contact">
        <P>Henrique Alende da Silveira, Federal University of Santa Catarina (UFSC), Brazil.</P>
        <P>E-mail: <Mail /></P>
      </Section>
    </article>
  )
}

export default function AboutDoc() {
  const lang = useLang((s) => s.lang)
  return lang === 'pt' ? <AboutPt /> : <AboutEn />
}

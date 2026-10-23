import { Bibliography, Callout, Cite, Eq, K, P, Section, Table, UL } from './ui'

export default function AuralizationDocEn() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Auralization</h1>
        <P>
          Auralization prepares a sound for a listening test. You upload a recording, choose the direction it should seem to come from and listen to the
          result on headphones. The final file is stereo and can be analysed in Post-Processing like any other.
        </P>
        <Callout kind="info" title="In this first version">
          The chain has four blocks: Source, Environment, HRTF and Headphone. Only <strong>Source</strong> and <strong>HRTF</strong> work for now.
          Environment (kitchen, car-cabin or aircraft-cabin reverberation) and Headphone (headphone response compensation) show as “Coming soon”.
        </Callout>
      </header>

      <Section id="visao-geral" title="Overview">
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Choose the source:</strong> upload a WAV in the left column and select it under <K>Source sound</K>.</li>
          <li><strong>Choose the HRTF set:</strong> the spherical-head model, or your own <K>.sofa</K> file (<K>Upload SOFA</K>).</li>
          <li><strong>Place the sound:</strong> click the map or use <K>Azimuth</K>, <K>Elevation</K> and <K>Distance</K>.</li>
          <li><strong>Listen:</strong> under <K>Listen and compare</K>, switch between <K>Processed</K> and <K>Original</K> without losing your place.</li>
          <li><strong>Create the file:</strong> <K>Create stereo file</K> processes the whole file and adds it to your list. Then <K>Open in Post-Processing</K> or <K>Download WAV</K>.</li>
        </ol>
      </Section>

      <Section id="hrtf" title="How the sound gets a direction">
        <P>
          We hear which side a sound comes from through two main cues <Cite ids={['blauert1997']} />: it reaches the nearer ear <strong>earlier</strong>
          (interaural time difference, ITD) and <strong>louder</strong>, mostly at high frequencies, because the head shadows the other ear (interaural
          level difference, ILD). The HRTF gathers these cues, plus the effect of the outer ear, as an impulse response for each ear and each direction.
          Convolving the sound with the pair of responses gives it that direction.
        </P>
        <P><strong>PySQA convention:</strong> azimuth 0° is in front of the listener, positive to the right (−90° is left, 180° is behind); positive elevation is up.</P>
        <Callout kind="warn" title="SOFA files use the opposite sign">
          The SOFA format <Cite ids={['majdak2013']} /> counts azimuth to the left. PySQA flips the sign when reading the file, so the map and the controls
          always follow the convention above.
        </Callout>

        <h3 className="text-base font-semibold text-white mt-2">The spherical-head model</h3>
        <P>
          This is the set that ships with PySQA, so you can try it without downloading anything. It combines the Woodworth delay <Cite ids={['woodworth1954']} />
          with the head-shadow filter of Brown and Duda <Cite ids={['brown1998']} />. It is a teaching model: it has <strong>no outer ear</strong>, so it
          does not reproduce elevation or tell front from back like a measured HRTF.
        </P>
        <Eq n={1} where={<>where a is the head radius (0.0875 m), c is the speed of sound (343 m/s) and θ is the angle of the source from the median plane, in radians.</>}>
          ITD = (a / c) · ( |θ| + sin |θ| )
        </Eq>
        <Table
          head={['Azimuth', 'Theoretical ITD (Equation 1)', 'Note']}
          widths={['20%', '30%', '50%']}
          rows={[
            ['0° (front)', '0 ms', 'Both ears get the same signal'],
            ['30°', '0.26 ms', 'PySQA shows the value measured on the response, with 0.02 ms resolution (at 48 kHz)'],
            ['60°', '0.49 ms', ''],
            ['90° (right)', '0.66 ms', 'The model’s maximum; the left ear is in shadow above a few kHz'],
          ]}
        />

        <h3 className="text-base font-semibold text-white mt-2">Measured HRTFs (SOFA files)</h3>
        <P>
          Sets measured on people or mannequins are more realistic. PySQA reads <K>SimpleFreeFieldHRIR</K> files (two ears) and uses the
          <strong> measured direction nearest</strong> to the one you asked for, with no interpolation; if it is far, the result says which direction was used.
          If the SOFA file’s sample rate differs from your recording, the responses are resampled and the delay between the ears is preserved.
          If the file carries <K>Data.Delay</K>, the delay is applied.
        </P>
        <Table
          head={['Set', 'Licence', 'Status']}
          widths={['34%', '30%', '36%']}
          rows={[
            [<>SADIE II <Cite ids={['kearney2024']} /></>, 'Apache 2.0', 'Confirmed. 20 subjects, SOFA.'],
            [<>ARI <Cite ids={['ari']} /></>, 'CC BY-SA 3.0', 'Confirmed. Derived files keep the licence.'],
            [<>CIPIC <Cite ids={['algazi2001']} /></>, 'Public domain (2001 announcement)', 'To be confirmed: the download page did not open when checked.'],
          ]}
        />
        <P>The list at the bottom of the Auralization page shows the same status and the source links. Cite the set you use.</P>
      </Section>

      <Section id="distancia" title="Distance and level">
        <P>
          Distance changes <strong>only the level</strong>, by the inverse-distance law with 1 m as reference: 2 m gives −6 dB. PySQA does not yet change the
          timbre with distance or add reverberation (that comes with the Environment block).
        </P>
        <Eq n={2}>gain [dB] = −20 · log₁₀( d / 1 m )</Eq>
        <P>
          The generated file is a 32-bit float WAV, so a peak above 0 dBFS <strong>is stored without clipping</strong>. Headphones, however, play up to 0 dBFS
          only: if the peak warning appears, lower the source level or increase the distance.
        </P>
        <Callout kind="warn" title="The real level depends on your equipment">
          PySQA does not know the gain of your headphones or sound card. The result is good for comparing sounds with each other in the same chain; it does
          not guarantee a dB SPL level at the ear. The mV/Pa calibration of the original recording’s microphone is <strong>not</strong> carried to the generated file.
        </Callout>
      </Section>

      <Section id="limites" title="Limits and good practices">
        <UL>
          <li><strong>Use headphones.</strong> On loudspeakers the sense of direction is lost.</li>
          <li><strong>Multichannel source:</strong> the channels are summed into one before processing.</li>
          <li><strong>The preview uses the first 12 s.</strong> The <K>Original</K> version plays the whole file.</li>
          <li><strong>Uploaded SOFA sets live in the server’s memory</strong> and vanish if it restarts; PySQA tells you and you upload again. Files made with the spherical-head model are rebuilt on their own; those made with an uploaded SOFA are not.</li>
          <li><strong>At most 4 SOFA sets per session.</strong></li>
          <li><strong>Everyone hears differently.</strong> HRTFs from another person or a mannequin work better for some listeners than others; report which set you used.</li>
        </UL>
      </Section>

      <Section id="referencias" title="References">
        <Bibliography />
      </Section>
    </article>
  )
}

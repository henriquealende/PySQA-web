import { Bibliography, Callout, Cite, Eq, K, P, Section, Table, UL } from './ui'

export default function AuralizationDocEn() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Audio Preparation</h1>
        <P>
          This page prepares a sound for a listening test. You upload a recording, choose the direction it should seem to come from and listen to the
          result on headphones. The final file is stereo and can be analysed in Post-Processing like any other.
        </P>
        <Callout kind="info" title="In this first version">
          The chain has four blocks: Source, Environment, HRTF and Headphone. <strong>Source</strong>, <strong>Environment</strong> (you upload the impulse response of
          the room, car or aircraft) and <strong>HRTF</strong> work now. The Headphone block (headphone response compensation) shows as “Coming soon”.
        </Callout>
      </header>

      <Section id="visao-geral" title="Overview">
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Choose the source:</strong> upload a WAV in the left column and select it under <K>Source sound</K>.</li>
          <li><strong>Choose the environment (optional):</strong> under <K>Environment</K>, upload a room (RIR) or binaural (BRIR) impulse response.</li>
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
        <P>The list at the bottom of the Audio Preparation page shows the same status and the source links. Cite the set you use.</P>
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

            <Section id="ambiente" title="Environment: the room in the sound">
        <P>
          A room’s <strong>impulse response</strong> (RIR) is what you would hear if someone made a very short clap there: the direct sound, the first
          reflections and the fading reverberation. Convolving your audio with it puts the sound inside the room. Under <K>Environment</K> pick the type and
          upload a WAV with <K>Upload WAV</K>:
        </P>
        <Table
          head={['Type', 'File', 'What PySQA does']}
          widths={['24%', '26%', '50%']}
          rows={[
            ['No environment', '—', 'Only the HRTF block (free field).'],
            ['Room (RIR)', '1-channel WAV', 'The direct sound goes through the HRTF of the chosen direction. The reverberation, from 2.5 ms after the direct sound, is applied with a different version for each ear.'],
            ['Binaural (BRIR)', '2-channel WAV (left and right)', 'Applies each ear’s channel. The BRIR already includes the head, so the HRTF block is ignored.'],
          ]}
        />
        <Callout kind="info" title="A simplification to know about">
          In a 1-channel RIR the first reflections are <strong>not placed in space</strong>: after the direct sound the room sounds diffuse. For reflections
          with direction, use a measured BRIR. To make the two ears different, PySQA uses a random-phase all-pass filter (10 ms), which keeps the spectrum
          and the decay.
        </Callout>
        <P><strong>Level:</strong> the room does not make the sound louder. PySQA scales the filter so that the total energy equals that of the head alone, so
          the environment only redistributes the energy between the direct sound and the reverberation. The <K>Reverberation</K> control (−30 to +10 dB) changes only what comes after the direct sound.</P>

        <h3 className="text-base font-semibold text-white mt-2">Acoustic parameters of the response</h3>
        <P>
          When you upload the file, PySQA computes the parameters below following ISO 3382 <Cite ids={['iso33821', 'iso33822']} />, from the Schroeder energy decay
          curve <Cite ids={['schroeder1965']} />. Counting starts at the peak of the response (the direct sound), and the noise floor is estimated at the end of
          the file and subtracted.
        </P>
        <Eq n={3} where={<>where h(t) is the impulse response and EDC(t) the energy still left after time t. The reverberation time comes from the slope of this curve in dB.</>}>
          EDC(t) = ∫<sub>t</sub><sup>∞</sup> h²(τ) dτ
        </Eq>
        <Eq n={4} where={<>t<sub>e</sub> = 50 ms (C50, for speech) or 80 ms (C80, for music).</>}>
          C<sub>te</sub> = 10 · log₁₀( ∫<sub>0</sub><sup>te</sup> h² dt / ∫<sub>te</sub><sup>∞</sup> h² dt )
        </Eq>
        <Eq n={5}>
          D50 = 100 · ∫<sub>0</sub><sup>50 ms</sup> h² dt / ∫<sub>0</sub><sup>∞</sup> h² dt   [%]
        </Eq>
        <Table
          head={['Parameter', 'What it measures', 'How PySQA computes it']}
          widths={['16%', '40%', '44%']}
          rows={[
            ['T20', 'Reverberation time (60 dB decay)', 'Line fitted to the curve between −5 and −25 dB, extrapolated to 60 dB'],
            ['T30', 'Same, with a wider range', 'Between −5 and −35 dB'],
            ['EDT', 'Early decay, which weighs most in the feeling of reverberation', 'Between 0 and −10 dB'],
            ['C50, C80', 'Clarity: early energy against late energy', 'Equation 4, in dB'],
            ['D50', 'Definition: share of the energy in the first 50 ms', 'Equation 5, in %'],
            ['T20 per band', 'How the room sounds in each frequency region', 'Octaves from 125 Hz to 4 kHz (4th-order Butterworth, zero phase)'],
          ]}
        />
        <P>
          When the response is too short or the noise floor covers the decay, the parameter shows “—”: PySQA does not invent a value.
          A large gap between T20 and T30 also warns that the decay is not a straight line, which is common in small rooms.
        </P>

        <h3 className="text-base font-semibold text-white mt-2">Where to find freely available room responses</h3>
        <Table
          head={['Set', 'Licence', 'Note']}
          widths={['32%', '24%', '44%']}
          rows={[
            [<>McVAMPIRE (minivan cabin) <Cite ids={['muller2024']} /></>, 'CC BY 4.0', 'Confirmed. 14 microphones per position: pick one channel and save it as a 1-channel WAV.'],
            [<>dEchorate (shoebox room) <Cite ids={['dicarlo2021']} /></>, 'CC BY 4.0', 'Confirmed. Laboratory room, several wall conditions.'],
            [<>BUT ReverbDB <Cite ids={['szoke2019']} /></>, 'CC BY 4.0', 'Confirmed. The retransmitted-speech part needs a separate licence.'],
            [<>IR64-CAR (car, 64 channels) <Cite ids={['lopezballester2025']} /></>, 'CC BY 4.0', 'Confirmed, but it has 64 channels: reduce it to 1 or 2 channels before uploading.'],
            [<>OpenAIR <Cite ids={['murphy2010']} /></>, 'Per item', 'Read the licence of each item.'],
            [<>eBrIRD (kitchen) <Cite ids={['ebrird']} /></>, 'To be confirmed', 'The site did not open when checked.'],
            [<>Aachen AIR <Cite ids={['jeub2009']} /></>, 'To be confirmed', 'The site did not open when checked.'],
          ]}
        />
        <P>PySQA accepts 1- or 2-channel WAV files of up to 30 s, and converts the sample rate to that of your audio when they differ.</P>
      </Section>

      <Section id="limites" title="Limits and good practices">
        <UL>
          <li><strong>Use headphones.</strong> On loudspeakers the sense of direction is lost.</li>
          <li><strong>Multichannel source:</strong> the channels are summed into one before processing.</li>
          <li><strong>The preview uses the first 12 s</strong> (with the room tail). The <K>Original</K> version plays the whole file.</li>
          <li><strong>Uploaded SOFA files and room responses live in the server’s memory</strong> and vanish if it restarts; PySQA tells you and you upload again. Files made only with the spherical-head model are rebuilt on their own; those made with an uploaded SOFA or room are not.</li>
          <li><strong>At most 4 files of each kind per session</strong> (4 SOFA and 4 room responses).</li>
          <li><strong>Room responses:</strong> 1- or 2-channel WAV, up to 30 s.</li>
          <li><strong>Everyone hears differently.</strong> HRTFs from another person or a mannequin work better for some listeners than others; report which set you used.</li>
        </UL>
      </Section>

      <Section id="referencias" title="References">
        <Bibliography />
      </Section>
    </article>
  )
}

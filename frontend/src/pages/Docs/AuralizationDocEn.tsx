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
          The chain has six blocks: Source, Environment, HRTF, Noise, Headphone and Level. <strong>Source</strong>, <strong>Environment</strong> (you upload the impulse response of
          the room, car or aircraft) <strong>HRTF</strong> and background <strong>Noise</strong> work now. The <strong>Quick scenes</strong> set all of this up at once. The <strong>Headphone</strong> block (compensate or simulate a measured headphone) acts on the final result; the <strong>Level</strong> block closes the chain.
        </Callout>
      </header>

      <Section id="visao-geral" title="Overview">
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Choose the source:</strong> upload a WAV in the left column and select it under <K>Source sound</K>.</li>
          <li><strong>Quick scene (optional):</strong> pick kitchen, living room, car cabin or aircraft cabin to start from a realistic point.</li>
          <li><strong>Choose the environment (optional):</strong> under <K>Environment</K>, upload a room (RIR) or binaural (BRIR) impulse response.</li>
          <li><strong>Choose the HRTF set:</strong> the spherical-head model, or your own <K>.sofa</K> file (<K>Upload SOFA</K>).</li>
          <li><strong>Place the sound:</strong> click the map or use <K>Azimuth</K>, <K>Elevation</K> and <K>Distance</K>.</li>
          <li><strong>Listen:</strong> under <K>Listen and compare</K>, switch between <K>Processed</K> and <K>Original</K> without losing your place.</li>
          <li><strong>Create the file:</strong> <K>Create stereo file</K> processes the whole file and adds it to your list. Then <K>Open in Post-Processing</K> or <K>Download WAV</K>.</li>
        </ol>
        <P>
          The chain cards (Environment, HRTF, Noise, Headphone and Level) work as tabs: each shows what was set in that step and, when clicked, opens its settings.
          The source is not a tab: it is chosen in the left column. The preview and the file creation always stay below.
        </P>
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

            <Section id="cenarios" title="Quick scenes and background noise">
        <P>
          A <strong>scene</strong> sets up, with one click, a synthetic room, the position of the sound and the background noise. Then you adjust each block as
          you like (or pick <K>No scene</K> to clear everything). They give you a realistic starting point, for example a refrigerator in a kitchen or an
          alert tone in a cabin.
        </P>
        <Table
          head={['Scene', 'Room (volume; source at)', 'T20 per band, 125 Hz to 4 kHz [s]', 'Background noise']}
          widths={['18%', '24%', '34%', '24%']}
          rows={[
            ['Kitchen', '30 m³; 2 m', '0.60 · 0.55 · 0.50 · 0.50 · 0.45 · 0.40', 'None'],
            ['Living room', '45 m³; 2.5 m', '0.59 · 0.55 · 0.50 · 0.47 · 0.43 · 0.41', 'None'],
            ['Car cabin', '3 m³; 0.8 m', '0.12 · 0.09 · 0.07 · 0.06 · 0.05 · 0.045', 'Brown, signal-to-noise ratio 12 dB'],
            ['Aircraft cabin', '80 m³; 1.5 m', '0.30 · 0.25 · 0.20 · 0.18 · 0.15 · 0.12', 'Pink, signal-to-noise ratio 8 dB'],
          ]}
        />
        <Callout kind="warn" title="These are not measurements">
          These values are <strong>starting points chosen by PySQA</strong> from usual orders of magnitude for each kind of space. They do not come from a
          published table and do not represent a specific place or vehicle. For a study, adjust them to your case and describe them in the method, or use a
          measured impulse response (Environment section).
        </Callout>

        <h3 className="text-base font-semibold text-white mt-2">How the synthetic room is made</h3>
        <P>
          PySQA generates a response with one impulse (the direct sound, at the time the sound takes to cover the distance) followed by a noise tail that decays
          with the reverberation time of each octave band. The strength of the tail relative to the direct sound comes from the critical distance
          <Cite ids={['kuttruff2009']} />, the distance at which the direct and reverberant energies are equal.
        </P>
        <Eq n={6} where={<>where V is the room volume (m³) and T the reverberation time at 1 kHz (s).</>}>
          D<sub>c</sub> = 0.057 · √( V / T )
        </Eq>
        <Eq n={7} where={<>with the source at a distance r. Close to the source (r &lt; D<sub>c</sub>) the direct sound dominates; far from it, the reverberation.</>}>
          E<sub>reverberant</sub> / E<sub>direct</sub> = ( r / D<sub>c</sub> )²
        </Eq>
        <Callout kind="info" title="What this model does not have">
          It is a statistical model: <strong>no individual reflections</strong> and no room modes. Below the Schroeder frequency, estimated by
          f<sub>S</sub> ≈ 2000 · √( T / V ) <Cite ids={['kuttruff2009']} />, a small room does not behave as a diffuse field: that is about 260 Hz in the kitchen and
          300 Hz in the car. In that region a real response has resonances the model does not reproduce. In a small room the broadband T20 shown stays close
          to that of the higher bands, which hold most of the energy.
        </Callout>
        <P>
          With a scene, the distance of the HRTF block stays at 1 m: the source distance already enters the ratio between direct sound and reverberation of the
          room, and adding it to the HRTF block would attenuate the direct sound twice.
        </P>

        <h3 className="text-base font-semibold text-white mt-2">Background noise</h3>
        <P>
          The <K>Background noise</K> block adds a continuous noise, <strong>different in each ear</strong>, at the chosen signal-to-noise ratio (SNR). The
          colour of the noise sets the spectrum:
        </P>
        <Table
          head={['Colour', 'Power spectrum', 'Typical use']}
          widths={['20%', '30%', '50%']}
          rows={[
            ['White', 'Equal at all frequencies', 'Hiss, reference'],
            ['Pink', 'Falls 3 dB per octave', 'Broadband noise, such as a cabin in cruise'],
            ['Brown', 'Falls 6 dB per octave', 'Bass-dominated noise, such as a car’s road noise'],
          ]}
        />
        <P>
          The SNR is the ratio of the RMS value of the signal to that of the noise, computed over the <strong>whole file and both ears</strong>, silent stretches
          included. The noise is generated with a fixed seed: the same settings always give the same file. The noise types are synthetic; they are not
          recordings of cars or aircraft.
        </P>
      </Section>

      <Section id="fone" title="Headphone">
        <P>
          The <strong>Headphone</strong> block acts on the result (room, position and noise). You upload the measurement of a headphone,
          a CSV with frequency in Hz and level in dB, and choose what to do with it:
        </P>
        <Table
          head={['Mode', 'What the filter does', 'When to use it']}
          widths={['24%', '40%', '36%']}
          rows={[
            ['No correction', 'Nothing.', 'When the stimulus will be played as it is.'],
            ['Compensate the headphone', 'Applies the inverse of the measured response, so the headphone sounds flat.', 'So the listener receives the stimulus as it was prepared.'],
            ['Simulate the headphone', 'Applies the headphone’s own response.', 'To hear or analyse a sound as that headphone would reproduce it.'],
          ]}
        />
        <Eq n={8} where={<>where M(f) is the measured response in dB, smoothed to 1/6 octave and with a mean of 0 dB between 200 Hz and 4 kHz, and G<sub>max</sub> is the maximum boost (12 dB by default).</>}>
          C(f) = min( −M(f) , G<sub>max</sub> )   [dB]
        </Eq>
        <P>
          The correction is <strong>limited</strong>: boosting a deep dip costs a lot of energy and almost always comes from a noisy measurement, so the boost has a ceiling and only
          cuts are free. It also fades out smoothly below 60 Hz and near the top of the band. The mean between 200 Hz and 4 kHz stays at 0 dB: the filter changes the shape of the
          spectrum, not the overall level. The filter is <strong>minimum phase</strong> (2048 samples), built from the magnitude of the response through the cepstrum
          <Cite ids={['oppenheim2010']} />: it creates no pre-ringing, and the phase of the real headphone response is not used.
        </P>
        <Callout kind="warn" title="It holds for the headphone that was measured">
          A headphone’s response changes from one unit to another and with how it sits on the ears. The compensation corrects the <strong>measurement you uploaded</strong>, not the
          headphone you are using. A measurement on an artificial head is not the response at a person’s ear.
        </Callout>
        <P>
          PySQA accepts CSV or TXT with an optional header, separated by comma, semicolon (with a decimal comma) or tab, covering at least 200 Hz to 8 kHz. With several columns it uses the
          one called <K>raw</K> and, failing that, <K>smoothed</K>. The file needs between 8 and 20,000 rows.
        </P>
        <Table
          head={['Source of measurements', 'Licence', 'Status']}
          widths={['34%', '30%', '36%']}
          rows={[
            [<>AutoEq <Cite ids={['pasanen']} /></>, 'Code MIT; data per source (oratory1990, crinacle, Rtings, InnerFidelity)', 'To be confirmed, source by source. PySQA embeds no measurement.'],
          ]}
        />
        <P>Check the licence of each measurement you use and cite the source in your work.</P>
      </Section>

      <Section id="nivel" title="Playback level (dB SPL)">
        <P>
          An audio file holds numbers between −1 and 1, not sound pressure. To say a stimulus plays at 60 dB SPL you need to know <strong>how much your equipment
          amplifies</strong>, and PySQA cannot measure that: you enter it. The <strong>Level</strong> block is the last step and sets the gain of the file so it reaches the
          <strong>target level</strong> on your equipment.
        </P>
        <Eq n={9} where={<>where ⟨x²⟩ is the mean square of the signal (all samples, the two ears summed in energy). A full-scale sine reads 0 dB; a sine of amplitude 0.1 reads −20 dB.</>}>
          L<sub>d</sub> = 10 · log₁₀( ⟨x²⟩ / ½ )   [dB re full-scale sine]
        </Eq>
        <Eq n={10} where={<>where L<sub>target</sub> is the target level in dB SPL and L<sub>FS</sub> is the level, at your ear, of a full-scale sine (0 dBFS) on your headphones and sound card. The resulting level is L<sub>FS</sub> + L<sub>d</sub>.</>}>
          G = L<sub>target</sub> − L<sub>FS</sub> − L<sub>d</sub>   [dB]
        </Eq>
        <Table
          head={['Mode', 'What sets the target level']}
          widths={['30%', '70%']}
          rows={[
            ['No adjustment', 'Nothing: the file keeps the level it has.'],
            ['Target level', 'The value you choose (20 to 110 dB SPL).'],
            ['Keep the recording level', 'The calibrated level of the original recording, computed from the microphone calibration (mV/Pa, done in Post-Processing). Without calibration the mode is blocked.'],
          ]}
        />
        <P>
          <strong>A</strong> weighting follows IEC 61672-1 <Cite ids={['iec61672']} />, and <strong>Z</strong> is unweighted. The level is a Leq of the <strong>whole file</strong>:
          it includes silent stretches, the room tail and the background noise, and it is not a level with a time constant (Fast or Slow).
        </P>
        <Callout kind="warn" title="It is a calculation from what you enter">
          The L<sub>FS</sub> value is your own assumption unless you measured it with an artificial ear or a coupler. Without that measurement the real level at the ear may be different, and
          comparing two stimuli with each other still counts for more than the absolute number. A headphone compensation keeps the mean level between 200 Hz and 4 kHz, so it does not undo this setting.
        </Callout>
        <P>
          If the gain takes the peak above 0 dBFS, the file keeps the exact value (32-bit float), but playback will clip: the result warns you. Lower the target level or use more sensitive
          equipment. The preview computes the gain on the first 12 s; the generated file uses the whole file, so the two may differ slightly.
        </P>
      </Section>

      <Section id="sala-propria" title="Want a room of your own?">
        <P>
          If the room you need is not among the scenes, <strong>Auralize Salas</strong> (<a href="https://auralize.com.br/salas?utm_source=pysqa&utm_medium=app&utm_campaign=docs" target="_blank" rel="noopener noreferrer" className="text-teal underline">auralize.com.br/salas</a>),
          a product of the same team, lets you model the geometry, apply materials and read RT, C80, STI and the Schroeder frequency. The impulse response exported as WAV (1 or 2 channels, up to 30 s)
          enters PySQA through the Environment block, with <K>Upload WAV</K>. The “From the Auralize team” card, in the Environment section, has an example comparison and can be closed; the
          <K>Build my room</K> chip in the Quick scenes brings it back.
        </P>
      </Section>

      <Section id="limites" title="Limits and good practices">
        <UL>
          <li><strong>Use headphones.</strong> On loudspeakers the sense of direction is lost.</li>
          <li><strong>Multichannel source:</strong> the channels are summed into one before processing.</li>
          <li><strong>The preview uses the first 12 s</strong> (with the room tail). The <K>Original</K> version plays the whole file.</li>
          <li><strong>Uploaded SOFA files, room responses and headphone measurements live in the server’s memory</strong> and vanish if it restarts; PySQA tells you and you upload again. Files made only with the spherical-head model are rebuilt on their own; those made with an uploaded SOFA, room or headphone are not.</li>
          <li><strong>At most 4 files of each kind per session</strong> (4 SOFA, 4 room responses and 4 headphone measurements).</li>
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

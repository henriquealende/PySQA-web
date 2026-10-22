import { Link } from 'react-router-dom'
import { Bibliography, Callout, Cite, Eq, Figure, K, P, Section, Table, UL } from './ui'
import { AveragingDemo, BitsDemo, CalibrationDemo, FastDemo, SamplingDemo, TriggerDemo } from './daDemos'

export default function DataAcquisitionDocEn() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Data Acquisition</h1>
        <P>
          Data Acquisition records sound straight from the microphone of your computer, tablet or phone, in the browser. It shows the level in real time,
          calibrates the microphone, triggers the recording by level, averages several recordings and takes the result, already calibrated, to Post-Processing.
          Nothing is sent to the server until you ask.
        </P>
        <Callout kind="tip" title="How to read this page">
          Each feature covers what it is, how PySQA does it and what to watch for. The controls on this page are simulations: play with them to see the effect before
          you record. References are listed in ABNT format at the end.
        </Callout>
      </header>

      <Section id="visao-geral" title="Overview">
        <P>The most common path:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Set up</strong> (left column): microphone, sample rate, channels, bits, duration and capture mode.</li>
          <li><strong>Calibrate</strong> with an acoustic calibrator (or by typing the sensitivity) to read dB SPL.</li>
          <li><strong>Monitor</strong> (<K>Monitor</K>): opens the microphone and shows level, waveform and spectrum live, without recording.</li>
          <li><strong>Record</strong> (<K>Record</K>, or <K>Watch</K> in level-trigger mode) and stop (<K>Stop</K>).</li>
          <li><strong>Review:</strong> listen to and look at the take; <K>Accept</K> keeps it, <K>Discard</K> throws it away.</li>
          <li><strong>Use:</strong> download WAV or CSV, or send it to Post-Processing.</li>
        </ol>
        <Callout kind="info" title="Works in the background">
          If you switch pages while the microphone is open, it stays open and the recording keeps going. A pulsing dot on the “Data Acquisition” tab tells you
          (amber: monitoring; orange: recording). If you close the tab with an unsaved take, the browser asks first.
        </Callout>
      </Section>

      <Section id="mapa" title="Feature map">
        <Table
          head={['Feature', 'What it does', 'Options']}
          widths={['22%', '50%', '28%']}
          rows={[
            ['Input Device', 'Chooses the microphone', 'System list; Refresh'],
            ['Sample Rate', 'How many samples per second', '44,100, 48,000 or 96,000 Hz'],
            ['Channels', 'Mono, or stereo reduced to mono', 'Mono; Stereo→Mono'],
            ['Bit Depth', 'Format of the recorded file', '16-bit PCM or 32-bit Float'],
            ['Duration', 'Record until you press Stop, or for an exact time', 'Free Run; Fixed (1 to 3,600 s)'],
            ['Capture mode', 'Record right away, or wait for the sound to appear', 'Immediate; Level Trigger'],
            ['Trigger', 'Parameters of the level trigger', 'Threshold, Pre-roll, Hold, Edge'],
            ['Averaging', 'Average of several takes', '2 to 99 takes; auto-start'],
            ['Microphone calibration', 'Converts the digital level to dB SPL', 'Calibrator (94, 114 dB or other); sensitivity in mV/Pa'],
            ['Signal Protection', 'Discards clipped takes and stops on silence', 'Overload abort; Auto-stop on silence'],
            ['Level (VU) and SPL meter', 'Live level; Fast, Leq, Max and Peak', 'A or Z weighting; Reset'],
            ['Live waveform and spectrum', 'Last 3 s and live spectrum', 'Spectrum average (Average)'],
            ['Recordings', 'List of takes kept in the browser', 'Play, WAV, CSV, send, delete'],
          ]}
        />
      </Section>

      <Section id="microfone" title="Microphone and permission">
        <P>
          The browser only releases the microphone with your permission, and only on secure pages (<strong>https</strong> or <strong>localhost</strong>)
          <Cite ids={['w3cmedia']} />. When you press <K>Monitor</K> for the first time, accept the browser prompt; only then do the real device names appear in the list.
        </P>
        <P>
          To record the sound as it is, PySQA <strong>turns off</strong> the echo cancellation, noise suppression and automatic gain control that browsers
          usually enable by default. Measurements need a signal that is not “improved” without your knowledge.
        </P>
        <Callout kind="warn" title="Fix the microphone gain">
          The operating system and some USB microphones have an input volume control. Any change to it after calibration invalidates the calibration.
          Set the gain once, calibrate and leave it alone.
        </Callout>
      </Section>

      <Section id="amostragem" title="Sample rate, channels and bits">
        <Section id="a-taxa" title="Sample rate" level={3}>
          <P>
            A sound is a continuous vibration; the computer stores it as a sequence of “snapshots” (samples) taken at equal intervals. The sample rate
            says how many per second. Only frequencies up to <strong>half</strong> the rate (the Nyquist frequency) can be recorded faithfully
            <Cite ids={['shannon1949', 'oppenheim2010']} />. Above that, the tone is “folded” down to a lower frequency that did not exist, called <em>aliasing</em>.
          </P>
          <Figure n={1} title="Sampling of a tone. Drag the frequency above Nyquist and see the tone the computer records."
            source="PySQA (simulation on this page)."
            note="In real microphones, a filter at the input of the converter removes everything above Nyquist before sampling, which avoids the problem.">
            <SamplingDemo />
          </Figure>
          <UL>
            <li><strong>44.1 and 48 kHz</strong> cover the whole range of hearing (up to 20 kHz) and are suitable for psychoacoustic metrics.</li>
            <li><strong>96 kHz</strong> is for ultrasonic content or the analysis of very fast transients; the file is twice as large.</li>
            <li>The chosen rate is that of the recorded file; if the device works at another rate, the browser converts.</li>
          </UL>
        </Section>

        <Section id="a-canais" title="Channels" level={3}>
          <P>
            PySQA records a single channel. <K>Stereo→Mono</K> asks the device for two channels and combines them into one (the average of the two). Use <K>Mono</K> with simple microphones.
          </P>
        </Section>

        <Section id="a-bits" title="Bits per sample" level={3}>
          <P>
            Each sample is rounded to one of 2<sup>N</sup> possible values. The error of this rounding is a constant-level noise floor, which sets the file’s
            <em> dynamic range</em>: about 6 dB for each bit <Cite ids={['oppenheim2010']} />.
          </P>
          <Eq n={1} where={<>Theoretical signal-to-noise ratio of a full-amplitude tone quantized with N bits.</>}>
            SNR ≈ 6.02 · N + 1.76 dB
          </Eq>
          <Figure n={2} title="Quantization of a tone with few bits. Increase the bits until the error (on the right) almost disappears." source="PySQA (simulation on this page).">
            <BitsDemo />
          </Figure>
          <UL>
            <li><strong>16-bit PCM:</strong> a range of about 98 dB, enough for most measurements, and compact files. Signals above full scale are cut off (they clip).</li>
            <li><strong>32-bit Float:</strong> quantization noise far below any real microphone noise and a huge margin against internal clipping. It is the recommended format when the level is uncertain.</li>
          </UL>
        </Section>
      </Section>

      <Section id="duracao" title="Duration and exact stop">
        <P>
          In <K>Free Run</K>, the recording lasts until you press <K>Stop</K>. In <K>Fixed</K>, it lasts the requested time, from 1 to 3,600 s. The count is made
          <strong> in samples</strong>, in the browser’s own audio thread, and not by a page timer: a 5 s take at 48 kHz has exactly 240,000 samples.
          The on-screen clock follows the recorded samples, not the computer’s time.
        </P>
        <Callout kind="info" title="Why this matters">
          Page timers lag by tens of milliseconds depending on the computer load. By counting samples, durations, pre-rolls and trigger holds
          come out with single-sample precision.
        </Callout>
      </Section>

      <Section id="disparo" title="Level trigger">
        <P>
          In <K>Level Trigger</K>, you press <K>Watch</K> and PySQA keeps an eye on the signal; the recording only starts when the level crosses a threshold. It is the ideal mode
          for short, unpredictable events, such as a click, a compressor start-up or a door slamming.
        </P>
        <UL>
          <li><strong>Threshold:</strong> the level, from −80 to 0 dBFS, that triggers the recording.</li>
          <li><strong>Edge:</strong> <em>Rising</em> triggers when the level rises above the threshold; <em>Falling</em>, when it drops below.</li>
          <li>
            <strong>Pre-roll</strong> (0 to 5 s): while waiting, PySQA keeps the last seconds of audio in memory. When it triggers, this stretch comes
            <em> before</em> the trigger, so the start of the event is not lost.
          </li>
          <li><strong>Hold</strong> (0.5 to 10 s): after the trigger, the recording ends when the signal stays below the threshold for this time.</li>
        </UL>
        <Figure n={3} title="Level trigger on a simulated record with two events. The green area is what would be recorded."
          source="PySQA (simulation on this page)."
          note="Lower the threshold until it catches the second, weaker event; increase the hold to join the two into a single take.">
          <TriggerDemo />
        </Figure>
        <Callout kind="tip">The dashed threshold line also appears on the live spectrum while you wait for the trigger.</Callout>
      </Section>

      <Section id="media" title="Averaging several takes">
        <P>
          With <K>Averaging</K> on, you record 2 to 99 takes (with <K>Auto-start next take</K> it restarts by itself) and PySQA delivers a single file, the
          <strong> time average</strong> of all of them, sample by sample, trimmed to the shortest one. Each take goes through review (<K>Accept</K> or <K>Discard</K>) before
          entering the average; the result is saved as <K>…_avgN</K>.
        </P>
        <P>
          This works for signals that <strong>repeat identically and in sync</strong>, such as the response to an impact triggered the same way every time:
          the signal adds up and the noise, which is different in each take, partly cancels out. The noise falls with the square root of N, that is, the signal-to-noise ratio rises 3 dB each time
          the number of takes doubles <Cite ids={['bendat2010']} />.
        </P>
        <Figure n={4} title="Averaging takes of a repetitive response with noise. Increase the number of takes and the noise decreases." source="PySQA (simulation on this page).">
          <AveragingDemo />
        </Figure>
        <Callout kind="warn" title="Do not use it for random noise">
          If the sound is continuous noise (an engine, a fan), the takes do not coincide in time and the average simply <em>reduces</em> the signal. For such sounds,
          record a longer take and use the <em>Average</em> of the live spectrum or the Post-Processing analyses.
        </Callout>
      </Section>

      <Section id="calibracao" title="Microphone calibration">
        <P>
          Without calibration, PySQA can only give the level in <strong>dBFS</strong> (relative to the converter’s full scale). Calibrating means telling how many pascals
          correspond to that full scale; from then on, levels become <strong>dB SPL</strong> <Cite ids={['iso1683']} />. Open the calibration with the microphone closed,
          under <K>Microphone calibration</K>.
        </P>
        <P><strong>With an acoustic calibrator</strong> (the recommended path). A calibrator emits a tone of known level, usually 94 dB (1 Pa) or 114 dB, at 1 kHz
          <Cite ids={['iec60942']} />:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li>Fit the calibrator on the microphone and switch it on. The wizard shows the live level and tells you whether it is too low or clipping.</li>
          <li>Over 5 s, PySQA measures the tone: it looks for the exact frequency of the tone (with a Hann window <Cite ids={['harris1978']} />) and measures only its energy, ignoring noise and hum.</li>
          <li>It compares this with the calibrator level and computes the full-scale pressure and the sensitivity in mV/Pa.</li>
        </ol>
        <Eq n={2} where={<>p<sub>cal</sub>: RMS pressure of the calibrator; a<sub>RMS</sub>: RMS value of the measured tone in full-scale units (1.0 = full scale).</>}>
          p<sub>FS</sub> [Pa] = p<sub>cal</sub> / a<sub>RMS</sub> , sensitivity [mV/Pa] = 1000 / p<sub>FS</sub>
        </Eq>
        <Figure n={5} title="Calibration calculator. Change the measured level and see the sensitivity PySQA would obtain."
          source="PySQA (simulation on this page)."
          note="Example: a 94 dB calibrator read at −23 dBFS gives about 14.2 Pa at full scale and 70.6 mV/Pa.">
          <CalibrationDemo />
        </Figure>
        <P>
          <strong>Known sensitivity:</strong> if you know the microphone’s sensitivity (from the data sheet), type it in the corresponding tab of the wizard.
        </P>
        <UL>
          <li>The calibration is kept <strong>in your browser</strong>, for that microphone. It holds as long as the input gain does not change.</li>
          <li>The wizard warns when the tone is clipping, too quiet, at the wrong frequency or mixed with too much noise; clipping and a very low level prevent saving.</li>
          <li>Takes recorded with a calibrated microphone carry the calibration. When you send them to Post-Processing, it is applied to the file automatically (“xx mV/Pa ✓”), and the list marks <em>calibrated</em>.</li>
          <li>The exported CSV has a <K># Calibration:</K> line with the full-scale pressure.</li>
        </UL>
      </Section>

      <Section id="nivel" title="Level meters">
        <Section id="n-vu" title="Level meter (VU)" level={3}>
          <P>
            The horizontal bar shows the <strong>peak</strong> and the <strong>RMS</strong> value of the signal from −60 to 0 dBFS, with a peak marker that
            stays ~0.6 s before falling. The <K>CLIP</K> indicator lights up when a sample reaches full scale (1.0): from then on the waveform is cut off
            and the measurement is compromised.
          </P>
        </Section>

        <Section id="n-spl" title="Sound level meter" level={3}>
          <P>
            In the top bar, the meter shows, in dB SPL if the microphone is calibrated (in dBFS otherwise):
          </P>
          <UL>
            <li><strong>Level with Fast time weighting:</strong> the “instantaneous” level, smoothed with a time constant of 125 ms <Cite ids={['iec61672']} />.</li>
            <li><strong>Leq:</strong> the equivalent level, the energy average since monitoring began (or since the start of the take).</li>
            <li><strong>Max:</strong> the highest Fast value.</li>
            <li><strong>Peak:</strong> the highest peak value, without smoothing.</li>
          </UL>
          <P>
            The <K>A</K> and <K>Z</K> buttons choose the frequency weighting: A (the curve of sound level meters, dB(A), see Figure 7 of the
            <Link to="/docs/post-processing" className="text-teal underline"> Post-Processing</Link> documentation) or Z (none). The A filter is designed for the sample rate in use and stays
            within 0.8 dB of the standard up to 10 kHz. <K>Reset</K> restarts the Leq and the maximum.
          </P>
          <Figure n={6} title="Meter response to a 1 s burst at 94 dB over a 40 dB background."
            source="PySQA (simulation on this page)."
            note="The Fast level rises and falls with the 125 ms constant; Slow (1 s), shown only for comparison, reacts more slowly. The Leq of the segment sums up all the energy in one number.">
            <FastDemo />
          </Figure>
          <Callout kind="info">
            The sound level meter standard <Cite ids={['iec61672']} /> defines accuracy and tests that a browser application does not meet. This meter is for
            following the recording and adjusting the gain, and does not replace a class 1 or 2 meter when the standard requires one.
          </Callout>
        </Section>
      </Section>

      <Section id="protecao" title="Signal protection">
        <UL>
          <li>
            <strong>Overload abort</strong> (default −6 dBFS, adjustable from −20 to 0): if the signal exceeds this level during the recording, the take is discarded, because
            a clipped signal gives wrong measurements.
          </li>
          <li>
            <strong>Auto-stop on silence</strong> (default 2 s, from 0.5 to 30 s): ends the recording after this much time with the signal below −50 dBFS. It applies in any capture mode.
          </li>
        </UL>
      </Section>

      <Section id="ao-vivo" title="Live plots and review">
        <UL>
          <li><strong>Live waveform:</strong> the last 3 seconds, showing the minimum and maximum of each pixel column, so that short peaks and clipping (in orange) show up. It fills in while the recording runs.</li>
          <li><strong>Live spectrum:</strong> a 4,096-point FFT, from 20 Hz to the Nyquist frequency, on a logarithmic scale, from −90 to 0 dBFS. With <K>Average</K> checked, it accumulates the energy average of the frames: it is the way to see the noise floor of a continuous sound.</li>
          <li><strong>Review:</strong> when you stop, the take appears with the full waveform, the spectrum and a play button with a cursor. Only after <K>Accept</K> does it enter the list.</li>
        </UL>
      </Section>

      <Section id="gravacoes" title="Saved recordings">
        <P>
          Accepted takes stay in the <K>Recordings</K> list, <strong>kept in the browser itself</strong> (a local database, IndexedDB). They survive reloading the page and restarting the browser, but
          they do not leave your computer and may be erased if you clear the site data. For each take:
        </P>
        <UL>
          <li><strong>Play</strong> and view the waveform and spectrum (click the name).</li>
          <li><strong>WAV:</strong> downloads the recorded file, lossless, in the chosen format (16-bit or 32-bit float).</li>
          <li><strong>CSV:</strong> a time × amplitude table, with a header that records device, date, mode, rate, bits, duration and calibration. Above 500 thousand samples, the export reduces the density and warns you.</li>
          <li><strong>Send to Post-Processing:</strong> sends the WAV to the server for analysis and, if the take is calibrated, applies the calibration right away.</li>
          <li><strong>Delete:</strong> asks for confirmation.</li>
        </UL>
      </Section>

      <Section id="motor" title="How the capture works">
        <P>
          PySQA uses the <strong>Web Audio API</strong> <Cite ids={['w3cwebaudio']} />. The microphone audio goes through an <em>AudioWorklet</em>, a small program that runs on the browser’s
          audio thread and receives the raw numbers (floating point, uncompressed). It counts samples, applies the pre-roll and the stop rules
          and computes the level every 50 ms. The <K>Worklet</K> badge at the top indicates that this path is active.
        </P>
        <Callout kind="warn" title="If the badge shows “MediaRec”">
          The AudioWorklet requires a secure page (https or localhost). Without it, PySQA uses the browser’s <em>MediaRecorder</em>, which stores compressed sound
          (lossy) and controls the duration with a timer. It works for recording, but it is <strong>not suitable for measurements</strong>. Open PySQA over https.
        </Callout>
      </Section>

      <Section id="limites" title="Limits and good practices">
        <UL>
          <li><strong>Calibrate before measuring</strong> and do not touch the gain afterwards.</li>
          <li><strong>Leave headroom:</strong> prefer peaks between −20 and −6 dBFS. 32-bit float forgives a low level; 16-bit does not forgive clipping.</li>
          <li><strong>A computer microphone is not a measurement microphone.</strong> Laptop and phone microphones have an uneven response and internal controls. To measure, use a measurement microphone connected to an audio interface.</li>
          <li><strong>One channel at a time</strong> and one sample rate per take.</li>
          <li><strong>Your takes stay only in the browser</strong> until you send them. Download the important ones.</li>
          <li><strong>Silence around you</strong> during calibration: loud noise reduces the purity of the tone and the wizard warns you.</li>
        </UL>
      </Section>

      <Section id="referencias" title="References">
        <Bibliography />
      </Section>
    </article>
  )
}

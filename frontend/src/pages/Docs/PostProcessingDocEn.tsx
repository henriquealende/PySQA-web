import { Bibliography, Callout, Cite, Eq, Figure, K, P, Section, Table, UL } from './ui'
import {
  BarkDemo, EnvelopeChart, FilterDemo, FluctuationChart, LoudnessChart, OctaveChart, RoughnessChart, SharpnessChart,
  SpectrogramChart, SpectrumChart, TonalityChart, WeightingDemo, WindowDemo,
} from './demos'

export default function PostProcessingDocEn() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Post-Processing</h1>
        <P>
          Post-Processing is the page where you open WAV recordings and examine them: waveform, spectrum, spectrogram,
          1/3-octave bands, envelope and the sound quality metrics (loudness, sharpness, roughness, fluctuation
          strength, tonality and impulsiveness). Here you can also filter, apply windows and weightings, and compare several files
          at once.
        </P>
        <Callout kind="tip" title="How to read this page">
          Each feature has three parts: <strong>what it is</strong> (in plain language), <strong>how PySQA computes it</strong> and
          <strong> what to look for when interpreting it</strong>. The interactive charts were computed with PySQA itself, and the
          references are listed at the end in ABNT format.
        </Callout>
      </header>

      {/* ── 1 ── */}
      <Section id="visao-geral" title="Overview">
        <P>The typical workflow has five steps:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Import:</strong> drag WAV files onto the import area or click to choose them. You can upload several at once.</li>
          <li><strong>Choose the view:</strong> Normal (waveform + spectrum), Spectrogram, 1/3 Octave or Envelope. For a psychoacoustic metric, pick it in <K>Metric</K>.</li>
          <li><strong>Process (optional):</strong> the edit button of each file opens filters, windows, weightings and loudness adjustment. The result becomes a <em>new file</em>; the original is never changed.</li>
          <li><strong>Compare and analyze in batch:</strong> overlay a second file (<K>Compare with</K>) or use <K>Batch</K> to compute several metrics on several files.</li>
          <li><strong>Export:</strong> WAV, spreadsheet (XLSX) or table (CSV).</li>
        </ol>
        <Callout kind="info" title="One channel at a time">
          In stereo files the waveform, spectrum, 1/3-octave and envelope show <strong>both channels</strong> (time charts: left in green, right in violet; frequency charts: left in orange, right in blue), and the spectrogram has an <strong>L / R</strong> switch. The <strong>metrics</strong> use only the <strong>left channel</strong>: computing both would double the processing time, and the screen warns you when this applies. To get metrics for the right channel, first split it into a mono file.
        </Callout>
      </Section>

      {/* ── 2 ── */}
      <Section id="mapa" title="Feature map">
        <P>The table summarizes everything the page offers. The names are the same ones that appear on the buttons of the interface.</P>
        <Table
          head={['Feature', 'What it does', 'Main parameters']}
          widths={['22%', '48%', '30%']}
          rows={[
            ['Waveform', 'Waveform over time, with the file peak and a clipping warning', 'Section selection; calibration'],
            ['Spectrum', 'Frequency spectrum of the section (FFT)', 'Hanning window; logarithmic axis'],
            ['Spectrogram', 'How the spectrum changes over time', 'NFFT, overlap, window, colormap, scale, max. frequency, dynamic range'],
            ['1/3 Octave', 'Level per 1/3-octave band (31 bands)', 'Z (none) or A weighting'],
            ['Envelope', 'Amplitude contour of the signal and its spectrum', 'Smoothing (ms), low-pass filter (Hz)'],
            ['Compare with', 'Overlays a second file on the first', 'Any uploaded file'],
            ['Filtering', 'Low-pass, high-pass, band-pass, band-reject, 1/3-octave equalizer, harmonic notch', 'Cutoff frequencies, order, Q, gains'],
            ['Windowing', 'Multiplies a section by a window (Rectangular, Hanning, Hamming, Blackman, Bartlett, Kaiser)', 'Start, end, type'],
            ['Weighting', 'A or C frequency weighting', 'Curve'],
            ['Loudness adjustment', 'Adjusts the level of one file to match the loudness of another', 'Reference file'],
            ['Metrics', 'Loudness (ISO 532-1 and ECMA-418-2), sharpness, roughness (D&W and ECMA), fluctuation strength, tonality, IPM', 'Free field or diffuse field'],
            ['Mic Calibration', 'Converts the digital signal to pascals (dB SPL)', 'Sensitivity in mV/Pa'],
            ['Batch', 'Several metrics on several files, plus annoyance models (SIL and ZWK)', 'Files, metrics, sections'],
            ['Export', 'WAV, XLSX and CSV', 'Chosen table'],
          ]}
        />
      </Section>

      {/* ── 3 ── */}
      <Section id="niveis" title="Levels, units and calibration">
        <P>
          A WAV file stores numbers between −1 and +1, not sound pressures. Without calibration, PySQA can only speak in
          <strong> dBFS</strong> (decibels relative to full scale). With the microphone sensitivity, the numbers become
          pascals and the levels become <strong>dB SPL</strong>, relative to 20 µPa <Cite ids={['iso1683']} />.
        </P>
        <Eq n={1} where={<>where p<sub>rms</sub> is the root-mean-square (RMS) sound pressure, in pascals, and p<sub>0</sub> = 20 µPa.</>}>
          L = 20 · log₁₀( p<sub>rms</sub> / p<sub>0</sub> )
        </Eq>
        <P>
          In the sidebar, <K>Mic Calibration</K> takes the sensitivity in mV/Pa. PySQA assumes 1 V at full scale and computes
          the pressure that corresponds to it:
        </P>
        <Eq n={2} where={<>Example: a 50 mV/Pa microphone gives 1000/50 = 20 Pa at full scale; a maximum-amplitude tone is then worth about 117 dB SPL (RMS).</>}>
          p<sub>FS</sub> [Pa] = 1000 / sensitivity [mV/Pa]
        </Eq>
        <Callout kind="warn" title="Without calibration, the metrics have no absolute value">
          Psychoacoustic metrics depend on the real level of the sound. When the file is not calibrated, PySQA assumes that full
          scale is 1 Pa (a maximum-amplitude tone would be ≈ 91 dB SPL). The numbers are useful to <em>compare</em> files recorded
          in the same way, but they are not absolute values. To calibrate, use an acoustic calibrator <Cite ids={['iec60942']} /> on the
          Data Acquisition page and bring the already calibrated recording into Post-Processing, or type in the microphone sensitivity.
        </Callout>
        <P>
          In dBFS, the <strong>spectrum</strong> uses the peak value (0 dBFS is a maximum-amplitude tone) and the <strong>1/3-octave
          bands</strong> use the RMS value (a maximum-amplitude tone reads −3 dBFS). In dB SPL, both views use the RMS value.
        </P>
      </Section>

      {/* ── 4 ── */}
      <Section id="trecho" title="Selecting a segment">
        <P>
          Often only part of the recording matters: a start-up noise, an event, a stable stretch. In the Normal view,
          drag over the waveform (or type the limits in the <K>Section</K> bar) to choose the segment. All views, metrics and
          the batch then use only that segment, and the time axes keep showing the original time of the file.
        </P>
        <Callout kind="tip">Computing only the segment of interest also greatly reduces time and memory, especially for the ECMA-418-2 metrics.</Callout>
      </Section>

      {/* ── 5 ── */}
      <Section id="visualizacoes" title="Views">
        <Section id="v-onda" title="Waveform" level={3}>
          <P>
            Shows the amplitude over time (in full scale, or in pascals if the file is calibrated). For long files, PySQA draws at most
            8,000 points, but it keeps the <em>maximum and minimum</em> of each stretch, so short peaks and clipping never disappear
            from the drawing. The peak of the whole file appears below the chart.
          </P>
        </Section>

        <Section id="v-espectro" title="Spectrum" level={3}>
          <P>
            The spectrum shows <em>how much energy there is at each frequency</em>. PySQA applies the Hanning window to the whole segment,
            computes the fast Fourier transform (FFT) and corrects the window gain, so that a 94 dB SPL tone appears at 94 dB
            at the peak (RMS level per line). The frequency resolution is Δf = fs / N: the longer the segment, the finer the spectrum.
          </P>
          <Figure n={1} title="Spectrum of two tones (1 kHz at 94 dB and 3 kHz at 74 dB) in weak noise. The peaks read the true levels."
            note="4 s synthetic signal, calibrated. For a tone between two FFT lines, the Hanning window can underestimate the peak by up to about 1.4 dB.">
            <SpectrumChart />
          </Figure>
          <P>
            To draw quickly, the spectrum is reduced to 2,400 points on a logarithmic axis: each point keeps the <em>peak</em> of its
            band (no tone disappears). Stereo files get one curve per channel, left and right. The drawing follows the idea of windowed spectral
            analysis described by Harris <Cite ids={['harris1978']} />.
          </P>
        </Section>

        <Section id="v-espectrograma" title="Spectrogram" level={3}>
          <P>
            The spectrogram splits the signal into short blocks and computes the spectrum of each one; the result is an image in which the
            horizontal axis is time, the vertical axis is frequency and the color is level. It is the right tool for sounds that change: accelerations,
            whistles, impacts. The method is the short-time Fourier transform <Cite ids={['allen1977']} />.
          </P>
          <Figure n={2} title="Spectrogram of a sweep signal (chirp) from 200 Hz to 3.8 kHz: the frequency rises with time."
            note="NFFT 256, 50 % overlap, Hanning window, fs = 8 kHz.">
            <SpectrogramChart />
          </Figure>
          <Table
            head={['Parameter', 'Default', 'Effect']}
            widths={['24%', '16%', '60%']}
            rows={[
              ['NFFT', '2048', 'Block size. Larger = finer frequencies, blurrier time (Δf = fs / NFFT).'],
              ['Overlap', '75 %', 'How much a block repeats of the previous one. More overlap = smoother image, slower computation.'],
              ['Window', 'Hanning', 'Shape of the window of each block (see “Windowing” below).'],
              ['Colormap / Freq. scale', 'magma / log', 'Appearance and frequency axis (logarithmic or linear).'],
              ['Max frequency', '20 kHz', 'Cuts the vertical axis (limited to the Nyquist frequency).'],
              ['Dynamic range', '90 dB', 'Range of dB below the maximum that receives color; whatever is below becomes the floor.'],
            ]}
          />
          <Callout kind="info">
            There is an unavoidable trade-off: long blocks resolve frequency well and time poorly; short blocks do the opposite. The
            image shows the relative level (in full scale), not calibrated values in pascals. With more than 400 blocks, PySQA
            shows one every <em>k</em> to limit the size of the data.
          </Callout>
        </Section>

        <Section id="v-oitava" title="1/3-octave bands" level={3}>
          <P>
            The ear does not resolve isolated frequencies as well as wide bands; that is why in acoustics it is common to summarize the spectrum
            in bands whose width is 1/3 octave. PySQA uses the 31 preferred center frequencies, from 20 Hz to 20 kHz
            <Cite ids={['iso266']} />. Each band goes from f<sub>c</sub>/2<sup>1/6</sup> to f<sub>c</sub>·2<sup>1/6</sup>; the signal goes through a
            band-pass filter and the level is the RMS value of what is left. Bands above 98 % of the Nyquist frequency are omitted.
          </P>
          <Figure n={3} title="1/3-octave levels of a white noise and a pink noise, both with 70 dB SPL overall."
            note="White noise has the same energy per hertz, so it rises 3 dB per octave across the bands; pink noise has the same energy per octave and stays flat.">
            <OctaveChart />
          </Figure>
          <Callout kind="warn" title="Not a class 1 analyzer">
            PySQA's filters are 4th-order Butterworth filters applied in both directions (see “Filters”), not the standardized filters
            of IEC 61260-1 <Cite ids={['iec61260']} />. The results are very good for analysis and comparison, but they do not replace
            a certified analyzer when a standard requires compliance.
          </Callout>
          <P>
            In <K>⚙</K> you choose the weighting: <strong>Z</strong> (none) or <strong>A</strong> (applied before splitting into bands,
            see “Frequency weighting (A and C)”).
          </P>
        </Section>

        <Section id="v-envelope" title="Envelope" level={3}>
          <P>
            The envelope is the amplitude contour: the “cover” of the signal. It reveals modulations, that is, slow variations in volume, which are
            the basis of metrics such as roughness and fluctuation strength. PySQA obtains it from the analytic signal (Hilbert transform): the
            envelope is the magnitude of this complex signal <Cite ids={['marple1999']} />.
          </P>
          <Figure n={4} title="400 Hz tone amplitude-modulated at 16 Hz (80 % depth) and its envelope."
            note="The envelope rises and falls 16 times per second, like the modulation.">
            <EnvelopeChart />
          </Figure>
          <UL>
            <li><strong>Smoothing (ms):</strong> optional moving average, to smooth the contour (0 = off).</li>
            <li><strong>LPF (Hz):</strong> optional 4th-order low-pass filter on the envelope, applied in both directions.</li>
            <li>The <strong>envelope spectrum</strong> shows at which frequencies the volume oscillates (the modulation frequencies).</li>
          </UL>
        </Section>

        <Section id="v-comparar" title="Comparing with another file" level={3}>
          <P>
            <K>Compare with</K> overlays the waveform (in blue), the spectrum (in yellow) or the metric of a second file on the first one, using
            the same segment. It is the most direct way to see the effect of processing: compare the original with the filtered version.
          </P>
        </Section>
      </Section>

      {/* ── 6 ── */}
      <Section id="processamento" title="Processing">
        <P>
          The edit button of each file opens four tabs. All of them generate a <strong>new file</strong> (32-bit floating point, so it does
          not clip) and preserve the original.
        </P>

        <Section id="p-filtros" title="Filters" level={3}>
          <UL>
            <li><strong>Low-pass / High-pass:</strong> let through what is below / above the cutoff frequency.</li>
            <li><strong>Band-pass / Band-reject:</strong> let through / remove a range between two frequencies.</li>
            <li><strong>1/3-Octave EQ:</strong> 31 controls from −24 to +24 dB, one per band. Applied directly on the spectrum: each FFT line is multiplied by the gain of the band it belongs to.</li>
            <li><strong>Harmonic Notch:</strong> a series of very narrow filters (notches) at the fundamental frequency and at all its harmonics below the Nyquist frequency. The Q factor (default 30) controls the narrowness: <em>width = f / Q</em>. Useful for removing 50/60 Hz mains noise and its harmonics.</li>
          </UL>
          <P>
            The cutoff filters are of the <strong>Butterworth</strong> type <Cite ids={['butterworth1930']} />, of order 4 by default, the flattest possible
            response in the passband. There is also a Linkwitz-Riley variant.
          </P>
          <Callout kind="info" title="“Forward-backward” filter (zero phase)">
            PySQA filters the signal forward and then backward <Cite ids={['gustafsson1996']} />. This way, the filter neither delays nor distorts the
            waveform in time (no phase distortion). The price: the amplitude response is applied twice. At the cutoff frequency the
            gain is −6 dB (not −3 dB, as in the single-pass filter), and the roll-off outside the band is twice as steep. Move the control:
          </Callout>
          <Figure n={5} title="Response of a 1 kHz Butterworth low-pass filter: single pass and forward-backward."
            source="theoretical curves of the equivalent analog filter; PySQA's digital filter is very close far from the Nyquist frequency.">
            <FilterDemo />
          </Figure>
        </Section>

        <Section id="p-janelas" title="Windowing" level={3}>
          <P>
            A <strong>window</strong> is a curve of weights between 0 and 1 that multiplies the signal segment. When a piece of sound is cut out, the edges
            “hit” abruptly and create artifacts in the spectrum (so-called spectral leakage). Windows that reach zero smoothly at the edges
            reduce this effect <Cite ids={['harris1978']} />. The choice is always a trade-off among three things:
          </P>
          <UL>
            <li><strong>Narrow main lobe</strong>: better separates two close frequencies.</li>
            <li><strong>Low side lobes</strong>: a strong tone does not “contaminate” the rest of the spectrum.</li>
            <li><strong>High coherent gain</strong>: the signal loses less energy when windowed.</li>
          </UL>
          <Figure n={6} title="The six PySQA windows (left, in time) and their frequency responses (right)."
            source="PySQA (own computation; 64-point windows, the same formulas as the windowing module)."
            note="Kaiser uses β = 14, the PySQA default. Rectangular does not smooth the edges, so it has the narrowest lobe and the highest leakage.">
            <WindowDemo />
          </Figure>
          <Table
            head={['Window', 'When to use']}
            widths={['22%', '78%']}
            rows={[
              ['Rectangular', 'Signals that already fit exactly in the segment (or transients that cannot be smoothed).'],
              ['Hanning', 'General use; it is the window of the spectrum and the spectrogram. Good balance between resolution and leakage.'],
              ['Hamming', 'Similar to Hanning, with a lower first side lobe, but which decays slowly.'],
              ['Blackman', 'When there are strong and weak tones close together and leakage must be low.'],
              ['Bartlett', 'Triangular window; simple, with moderate leakage.'],
              ['Kaiser (β = 14)', 'Extremely low leakage (about −106 dB), at the cost of a very wide main lobe (±4.7 lines).'],
            ]}
          />
          <P>
            In the <K>Windowing</K> tab you choose the start and end of the segment on the chart; PySQA shows the windowed signal and the window curve before
            creating the new file.
          </P>
        </Section>

        <Section id="p-ponderacao" title="Frequency weighting (A and C)" level={3}>
          <P>
            The human ear is not very sensitive to extreme lows and highs. The <strong>A</strong> and <strong>C</strong> weightings of the sound level
            meter standard <Cite ids={['iec61672']} /> imitate this sensitivity: the A curve strongly attenuates low frequencies and is the one
            used in noise limits (dB(A)); the C curve is flatter and is usually applied to high-level sounds.
          </P>
          <Figure n={7} title="A and C weighting curves (magnitude response) and the values tabulated in the standard."
            note="Both are 0 dB at 1 kHz. The circles and diamonds are the nominal values of IEC 61672-1; the curves pass through them.">
            <WeightingDemo />
          </Figure>
          <P>
            PySQA applies the weighting <strong>only once</strong>, in the frequency domain, with the exact analytic response of the standard and zero
            phase. We checked the weighting against the standard's table at 44.1, 48 and 96 kHz, with a maximum difference of 0.1 dB.
          </P>
          <Callout kind="tip" title="Do not weight before computing psychoacoustic metrics">
            Loudness, sharpness, roughness and the other metrics already include the response of the ear within the model. Applying A before them
            counts the same effect twice.
          </Callout>
        </Section>

        <Section id="p-loudness" title="Loudness adjustment" level={3}>
          <P>
            To compare the <em>timbre</em> of two sounds without the volume difference getting in the way, the <K>Loudness Adj.</K> tab adjusts the level
            of one file until its loudness (ISO 532-1, stationary method, free field) equals that of a reference file
            <Cite ids={['iso532']} />. Since loudness is not proportional to amplitude (it grows with the amplitude raised to about 0.6),
            PySQA starts from this power law and corrects the gain in successive steps, measuring the real loudness, until it hits the target within
            0.5 %. The result is a mono file.
          </P>
        </Section>
      </Section>

      {/* ── 7 ── */}
      <Section id="metricas" title="Psychoacoustic metrics">
        <P>
          Psychoacoustics measures <em>sensations</em>, not just pressures. Each metric below models one sensation, has its own unit and
          a well-defined reference point (the sound that is worth “1 unit”). The charts in this section were computed by PySQA with synthetic sounds:
          the amber circle marks the reference point, and the curve passes through it. This is the first sanity test of any implementation.
        </P>
        <P>
          The computations use the open-source library MoSQITo <Cite ids={['mosqito', 'eomys', 'sanmillan2021']} />, which provides the metrics of ISO 532-1,
          DIN 45692, Daniel and Weber, and also those of ECMA-418-2 (Sottek model). For the ECMA-418-2 family PySQA preferably uses the Sottek Hearing
          Model by Lotinga <Cite ids={['lotinga']} />, and falls back to MoSQITo when it is not available. NumPy and SciPy do the rest <Cite ids={['harris2020', 'virtanen2020']} />. Several metrics also show
          a <strong>critical-band distribution</strong>. The scale is the Bark scale:
        </P>
        <Figure n={8} title="Bark scale and critical bandwidth as a function of frequency."
          source="PySQA (own computation), with the expressions of Traunmüller (1990) and of Zwicker and Terhardt (1980)."
          note="Below 500 Hz the critical band is about 100 Hz; above, it grows in proportion to frequency. 24 bands cover the whole range of hearing.">
          <BarkDemo />
        </Figure>
        <P>
          The Bark is the unit of the critical-band scale <Cite ids={['zwicker1961', 'traunmuller1990', 'zwicker1980']} />: frequency ranges
          within which the ear sums energy. The loudness, sharpness, roughness and fluctuation strength models work
          band by band and then combine the result.
        </P>

        <Section id="m-loudness-iso" title="Loudness – ISO 532-1 (Zwicker)" level={3}>
          <P>
            <strong>What it is:</strong> the sensation of “volume”. Unit: <strong>sone</strong>. 1 sone is the loudness of a 1 kHz tone at 40 dB SPL;
            doubling the loudness (2 sone) corresponds to approximately +10 dB.
          </P>
          <Figure n={9} title="Loudness (ISO 532-1) of a 1 kHz tone as a function of level."
            note="The vertical axis is logarithmic: the straight line shows that loudness doubles every 10 dB (1 sone point at 40 dB).">
            <LoudnessChart />
          </Figure>
          <P>
            <strong>How PySQA computes it:</strong> by the Zwicker method of ISO 532-1 <Cite ids={['iso532', 'fastl2007']} />: the signal is decomposed into
            bands, the level of each one is converted into excitation and then into <em>specific loudness</em> (sone per Bark, in 240 steps of 0.1 Bark);
            the integral of this curve is the overall loudness. The <K>global value</K> shown is that of the stationary method applied to the whole segment. The
            <em> N(t)</em> curve (time-varying method, with the signal converted to 48 kHz) is shown for inspecting sounds that change.
          </P>
          <P><strong>Interpretation:</strong> for sounds with strong temporal variation, the global value is an average; use the curve over time and, if
            necessary, select the segment of interest.</P>
        </Section>

        <Section id="m-loudness-ecma" title="Loudness – ECMA-418-2 (Sottek)" level={3}>
          <P>
            Computes the same sensation with the Sottek Hearing Model <Cite ids={['ecma418', 'sottek2016']} />, standardized in ECMA-418-2. The result
            is given in sone<sub>HMS</sub> and the frequency scale is the <strong>Bark<sub>HMS</sub></strong>. The global value is the time power average. PySQA
            preferably uses the implementation by Lotinga <Cite ids={['lotinga']} /> (ECMA-418-2:2025); if it is not available, it falls back to the
            MoSQITo implementation <Cite ids={['eomys']} />, which also includes the model.
          </P>
          <Callout kind="info">
            The ISO 532-1 and ECMA-418-2 values are <em>not interchangeable</em>: they are different models. Always compare within the same method.
          </Callout>
        </Section>

        <Section id="m-sharpness" title="Sharpness – DIN 45692" level={3}>
          <P>
            <strong>What it is:</strong> how “sharp” or “shrill” the sound is, related to the weight of the high frequencies. Unit: <strong>acum</strong>.
            1 acum is the sharpness of a one-critical-band noise centered at 1 kHz at 60 dB.
          </P>
          <Figure n={10} title="Sharpness (DIN 45692) of a one-critical-band-wide noise, at 60 dB, as a function of center frequency."
            note="The curve rises slowly up to about 15 Bark and shoots up in the highest bands, where the weighting grows exponentially.">
            <SharpnessChart />
          </Figure>
          <Eq n={3} where={<>N′(z) is the specific loudness (ISO 532-1); z, the band in Bark; g(z), the weighting (equal to 1 up to 15.8 Bark and growing exponentially above); N, the total loudness. The constant 0.11 is the normalization that makes the reference noise worth 1 acum.</>}>
            S = 0.11 · ∫ N′(z) · g(z) · z dz / N
          </Eq>
          <P>
            <strong>How PySQA computes it:</strong> the global value comes from MoSQITo, following DIN 45692 <Cite ids={['din45692', 'bismarck1974']} />, from the ISO 532-1 specific
            loudness in the chosen field (free or diffuse). The per-Bark curve shown is the contribution of each band to the sum.
          </P>
        </Section>

        <Section id="m-roughness" title="Roughness – Daniel and Weber and ECMA-418-2" level={3}>
          <P>
            <strong>What it is:</strong> the sensation of “harshness” of rapidly modulated sounds (between about 20 and 300 Hz): engines, bearings,
            hoarse voices. Unit: <strong>asper</strong>. 1 asper is the roughness of a 1 kHz tone at 60 dB with 100 % amplitude modulation at 70 Hz.
          </P>
          <Figure n={11} title="Roughness (Daniel and Weber) of a 1 kHz tone at 60 dB with 100 % modulation, as a function of modulation frequency."
            note="The maximum is near 70 Hz (1 asper), where the ear is most sensitive to this “harshness”.">
            <RoughnessChart />
          </Figure>
          <UL>
            <li>
              <strong>Daniel and Weber</strong> <Cite ids={['daniel1997']} />: classic model, with 47 bands of 0.5 Bark and analysis of the modulation
              depth in each one. The global value used is the <strong>90th percentile</strong> of the roughness over time (value exceeded 10 % of the time),
              which is not diluted by pauses. The per-band curve is the mean of the instants above the median.
            </li>
            <li>
              <strong>ECMA-418-2</strong> <Cite ids={['ecma418', 'eomys']} />: model based on the same Sottek Hearing Model, available in MoSQITo and in Lotinga's package; the
              global value is the 90th percentile of the curve over time (asper<sub>HMS</sub>).
            </li>
          </UL>
        </Section>

        <Section id="m-fluctuation" title="Fluctuation strength" level={3}>
          <P>
            <strong>What it is:</strong> the sensation of slow “beating” of the volume (up to about 20 Hz), like a siren or an engine running unevenly.
            Unit: <strong>vacil</strong>. 1 vacil is that of a 1 kHz tone at 60 dB with 100 % modulation at 4 Hz; the maximum occurs near 4 Hz
            <Cite ids={['fastl2007']} />.
          </P>
          <Figure n={12} title="Fluctuation strength of a 1 kHz tone at 60 dB with 100 % modulation, as a function of modulation frequency."
            note="The curve peaks at 4 Hz, as predicted by the literature, and falls on both sides.">
            <FluctuationChart />
          </Figure>
          <Callout kind="warn" title="In-house implementation, not standardized">
            There is no standard for this metric, and MoSQITo does not offer it. PySQA uses its own model, inspired by Fastl and Zwicker
            <Cite ids={['fastl2007']} />: the signal is split into 47 bands of 0.5 Bark; in each one, the envelope is extracted, the modulation
            index is measured at the dominant frequency (between 0.5 and 20 Hz) and the weight <em>1 / (f<sub>mod</sub>/4 + 4/f<sub>mod</sub>)</em> is applied. The bands
            are weighted by energy, and a constant calibrates the reference point (1 vacil). Use it to <strong>compare</strong> sounds,
            not as a normative absolute value.
          </Callout>
        </Section>

        <Section id="m-tonality" title="Tonality – ECMA-418-2" level={3}>
          <P>
            <strong>What it is:</strong> how much the sound contains audible tonal components (a hum, a whistle) amid the noise. Unit:
            <strong> tu<sub>HMS</sub></strong>; 1 tu corresponds, approximately, to a 1 kHz tone at 40 dB SPL.
          </P>
          <Figure n={13} title="Tonality (ECMA-418-2) of a 1 kHz pure tone and of a broadband noise, as a function of level."
            note="The tone has high tonality that grows with level; the noise stays close to zero.">
            <TonalityChart />
          </Figure>
          <P>
            <strong>How PySQA computes it:</strong> through the implementation of the Sottek Hearing Model <Cite ids={['ecma418', 'lotinga']} />, which separates, in each
            critical band, the tonal part from the noise part. PySQA uses a reorganised version of that code, which gives the same result (difference
            below 1e-6) with about a sixth of the memory and a third of the time. It is still one of the heaviest metrics: on an ordinary computer it takes
            about 1 s for each second of audio and uses about 70 MB per second of audio. For long files, select a segment.
          </P>
        </Section>

        <Section id="m-ipm" title="IPM – Impulsive Prominence Metric" level={3}>
          <P>
            <strong>What it is:</strong> a measure of how much <em>impulsive</em> sounds (clicks, bangs, compressor start-ups) stand out from the rest.
            PySQA uses the model by Silveira and colleagues <Cite ids={['silveira2024', 'silveira2026']} />, which extends the Nordtest NT ACOU 112 method
            <Cite ids={['nordtest']} /> to 1/3-octave bands.
          </P>
          <UL>
            <li>The signal is split into 21 1/3-octave bands (100 Hz to 10 kHz).</li>
            <li>In each band, the most prominent peak is located and a 200 ms window around it is analyzed.</li>
            <li>The prominence is <em>P = 3·log₁₀(onset rate) + 2·log₁₀(level difference)</em>, as in NT ACOU 112.</li>
            <li>A psychoacoustic weighting curve, derived from perception thresholds, is added to the prominences of each band.</li>
            <li>The <strong>global value</strong> sums the bands in energy: 10·log₁₀(Σ 10<sup>y/10</sup>), in dB.</li>
          </UL>
          <P>The chart shows the IPM per band (in Bark<sub>HMS</sub>) and a dashed line at the <strong>impulsiveness threshold of 5 dB</strong>.</P>
        </Section>
      </Section>

      {/* ── 8 ── */}
      <Section id="campo" title="Free field or diffuse field">
        <P>
          A microphone measures the pressure at a point; the ear, however, receives sound differently depending on the environment. In a <strong>free field</strong>,
          the sound comes from one direction (anechoic room, open air); in a <strong>diffuse field</strong>, it arrives equally from all directions (reverberant room).
          The models correct the response of the ear according to this choice. In the sidebar, <K>Field Type</K> applies to: ISO 532-1 loudness,
          sharpness, ECMA-418-2 loudness, ECMA-418-2 roughness and tonality. The other metrics (D&amp;W roughness, fluctuation strength and IPM)
          do not depend on the field. The default is free field.
        </P>
      </Section>

      {/* ── 9 ── */}
      <Section id="lote" title="Batch analysis and annoyance">
        <P>
          <K>Batch</K> computes several metrics on several files and gathers everything in a table. Tick the files in the left column, choose the metrics
          and click <K>Compute</K>. The computation runs one file and one metric at a time, with a progress bar, a time estimate and a cancel button
          (what was already computed is kept). If a file has a selected segment, only that segment enters the computation. Calculations that the server refuses because of lack of
          memory appear in a list of warnings. The result can be exported as XLSX.
        </P>
        <P>
          Two optional columns combine metrics into a single <strong>annoyance</strong> number, and the necessary data are added automatically:
        </P>
        <Eq n={4} where={<>N in sone (ISO 532-1), S in acum, R in asper (Daniel and Weber) and IPM in dB. It is a multiple linear regression, fitted to subjective annoyance judgments, developed in Silveira's thesis <Cite ids={['silveira2024tese']} />.</>}>
          Annoyance SIL = −25.95 + 10.24·N + 13.29·S + 7.75·R + 0.13·IPM
        </Eq>
        <Eq n={5} where={<>Psychoacoustic annoyance model of Zwicker and Fastl <Cite ids={['fastl2007']} />, with F in vacil. PySQA uses the stationary loudness in place of N<sub>5</sub> (the loudness exceeded 5 % of the time); for stationary sounds the two coincide.</>}>
          <span>PA = N · [ 1 + √( w<sub>S</sub>² + w<sub>FR</sub>² ) ]</span><br />
          <span>w<sub>S</sub> = (S − 1.75) · 0.25 · log₁₀(N + 10), if S &gt; 1.75, otherwise 0</span><br />
          <span>w<sub>FR</sub> = 2.18 / N<sup>0.4</sup> · (0.4·F + 0.6·R)</span>
        </Eq>
        <Callout kind="info" title="Origin of the SIL model">
          The model comes from the thesis <Cite ids={['silveira2024tese']} text="(SILVEIRA, 2024)" />, in which the perception of annoyance of refrigerator noises was measured in tests
          with listeners and related to the Loudness, Sharpness, Roughness and MPI metrics (the IPM of this PySQA). The thesis presents a fit for impulsive signals
          (adjusted R² of 0.933) and another for stationary signals (adjusted R² of 0.890). The coefficients of equation (4) are the ones implemented in PySQA; to
          exactly reproduce one of the published fits, see Table 54 and Table 57 of the thesis. The model was calibrated with refrigerator sounds: outside that kind
          of source, treat it as a comparison index.
        </Callout>
      </Section>

      {/* ── 10 ── */}
      <Section id="exportacao" title="Export">
        <UL>
          <li><strong>WAV:</strong> downloads the file (the original or the processed one). Processed files are saved as lossless 32-bit floating point.</li>
          <li><strong>XLSX:</strong> spreadsheet with the tables of the displayed data, one sheet per table (for example, waveform, spectrum and metrics).</li>
          <li><strong>CSV:</strong> one table at a time, generated in the browser itself, with no size limit. If a segment was selected, the file name indicates it.</li>
        </UL>
      </Section>

      {/* ── 11 ── */}
      <Section id="limites" title="Limits and good practices">
        <UL>
          <li><strong>Calibrate whenever possible.</strong> Without calibration, the metrics are only useful to compare files recorded in the same way.</li>
          <li><strong>One channel at a time for metrics.</strong> Stereo and multichannel files use the left channel; the charts show both.</li>
          <li><strong>Stationary or short segments.</strong> ECMA-418-2 metrics (tonality, roughness and loudness) consume a lot of time and memory; the server warns when a computation does not fit and suggests selecting a segment.</li>
          <li><strong>Sampling rate.</strong> Frequencies above half the sampling rate do not exist in the file; for the metrics, 44.1 and 48 kHz are adequate.</li>
          <li><strong>Zero-phase filters</strong> preserve the waveform, but apply the response twice; plan the cutoff frequencies taking the −6 dB into account.</li>
          <li><strong>Sessions.</strong> Your files stay in the server memory during the session; the browser keeps a copy and re-sends it automatically if the server restarts.</li>
        </UL>
      </Section>

      {/* ── 12 ── */}
      <Section id="agradecimentos" title="Acknowledgements">
        <P>
          A good part of what PySQA computes exists only because other people decided to share their work as open source. We especially thank:
        </P>
        <UL>
          <li>
            the <strong>MoSQITo</strong> team (Eomys Engineering and Green Forge Coop) <Cite ids={['eomys', 'mosqito']} />, who brought together in a free library the metrics
            of ISO 532-1, DIN 45692, Daniel and Weber and ECMA-418-2 (Sottek model), and everyone who contributes to it;
          </li>
          <li>
            <strong>Mike Lotinga</strong> <Cite ids={['lotinga']} />, for the Python implementation of the Sottek Hearing Model, and <strong>Roland Sottek</strong> <Cite ids={['sottek2016']} />,
            author of the model;
          </li>
          <li>the <strong>NumPy</strong> and <strong>SciPy</strong> communities <Cite ids={['harris2020', 'virtanen2020']} />.</li>
        </UL>
      </Section>

      <Section id="referencias" title="References">
        <Bibliography />
      </Section>
    </article>
  )
}

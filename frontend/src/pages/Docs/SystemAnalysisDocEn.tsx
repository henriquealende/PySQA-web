import { Bibliography, Callout, Cite, Eq, Figure, K, P, Section, Table, UL } from './ui'
import {
  BodeCoherenceChart, EstimatorsChart, HalfPowerDemo, ImpactWindowsDemo, ModesCheckTable, ModesFoundChart, NyquistModeChart, ResolutionDemo,
} from './saDemos'

export default function SystemAnalysisDocEn() {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">System Analysis</h1>
        <P>
          System Analysis answers the question: <em>“if I push this system, how does it respond?”</em> From a measured input (a force, an excitation
          signal) and one or more responses (acceleration, sound pressure), it computes the <strong>frequency response function</strong> (FRF), shows
          the Bode diagrams, assesses the quality of the measurement through coherence, and finds the <strong>modes</strong> of the system, with their natural frequencies and damping.
        </P>
        <Callout kind="tip" title="How to read this page">
          Each feature explains what it is, how PySQA computes it and what to look for. The charts use a simulated three-mode system with known values (87.3, 213.6 and 390.2 Hz),
          so you can see how close PySQA gets. The references are listed at the end.
        </Callout>
      </header>

      <Section id="visao-geral" title="Overview">
        <P>The typical workflow:</P>
        <ol className="text-sm text-slate-200 leading-relaxed list-decimal pl-5 flex flex-col gap-1 max-w-[72ch]">
          <li><strong>Load</strong> the records (UFF, WAV or CSV).</li>
          <li><strong>Indicate</strong> which channel is the <em>input</em> (the excitation) and which are the <em>outputs</em> (the responses).</li>
          <li><strong>Choose</strong> the estimator, the averaging type (continuous or impact) and the block length. The calculation runs by itself at every change.</li>
          <li><strong>Examine</strong> the Bode plot, the coherence, the real and imaginary parts, the Nyquist plot and the modes.</li>
          <li><strong>Export</strong> the FRF and the table of modes as CSV.</li>
        </ol>
      </Section>

      <Section id="mapa" title="Feature map">
        <Table
          head={['Feature', 'What it does', 'Options']}
          widths={['22%', '50%', '28%']}
          rows={[
            ['Files', 'Reads time records and ready-made FRFs', 'UFF (dataset 58), WAV, CSV'],
            ['Channels', 'Defines the input (one) and the outputs (several)', 'Marking in the channel table'],
            ['Estimator', 'How the FRF is calculated', 'H1, H2, Hv'],
            ['Averaging', 'How the averages are formed', 'Random / continuous (Welch); Impact (hammer)'],
            ['Block length', 'Size of each FFT block', '512 to 65,536 samples'],
            ['Overlap / Window', 'Block overlap and window', '0 to 75%; Hann, Hamming, Blackman, flat-top, rectangular'],
            ['Impact', 'Hit detection and windows', 'Trigger level, Pre-trigger, Force window, Exp. window ends at'],
            ['Response quantity', 'Converts acceleration, velocity and displacement', 'Accelerance, mobility, receptance'],
            ['Frequency range', 'Range displayed and analyzed', 'From… to…; unwrap phase'],
            ['Views', 'Ways to look at the FRF', 'Bode, Real / Imag, Nyquist, Modes'],
            ['Modes', 'Mode detection and damping', 'Prominence, spacing, method'],
            ['Export', 'Saves the results', 'FRF CSV; Modes CSV'],
          ]}
        />
      </Section>

      <Section id="conceitos" title="Basic concepts">
        <P>
          Imagine striking a beam with a hammer (the <strong>input</strong>) and measuring with an accelerometer how it moves (the <strong>output</strong>). The FRF is the ratio,
          frequency by frequency, between what comes out and what goes in:
        </P>
        <Eq n={1} where={<>X(f): input spectrum; Y(f): output spectrum. H is a complex number at each frequency: its magnitude tells <em>how much</em> the system amplifies, and its phase, <em>how much it lags</em>.</>}>
          H(f) = Y(f) / X(f)
        </Eq>
        <P>
          Where the system has a <strong>resonance</strong> (a mode), the FRF magnitude has a peak: there, a small force produces a large response, and the phase changes
          by about 180°. The narrower the peak, the lower the damping.
        </P>
        <P>
          Depending on what you measure at the output, the FRF has a different name <Cite ids={['ewins2000']} />:
        </P>
        <Table
          head={['Measured output', 'FRF', 'Relation to receptance']}
          widths={['30%', '30%', '40%']}
          rows={[
            ['Displacement / force', 'Receptance (compliance)', 'H'],
            ['Velocity / force', 'Mobility', 'jω · H'],
            ['Acceleration / force', 'Accelerance (inertance)', '(jω)² · H = −ω² · H'],
          ]}
        />
        <P>
          PySQA converts between the three: you tell it what your sensor measures (<K>The response channel measures</K>) and how you want to see the FRF (<K>Show the FRF as</K>). The
          damping calculation is always done in receptance form, so the first choice must reflect your sensor.
        </P>
      </Section>

      <Section id="dados" title="Loading the measurements">
        <UL>
          <li><strong>UFF</strong> (<em>Universal File Format</em>, dataset 58): the format of most vibration acquisition systems. PySQA reads time records (type 1) and FRFs (type 4), using the pyuff library <Cite ids={['pyuff']} />.</li>
          <li><strong>WAV:</strong> each channel in the file becomes a record. A stereo WAV with the force on one channel and the response on the other works.</li>
          <li><strong>CSV:</strong> a table with a time column followed by the channels (the sample rate comes from the time). Without a time column, enter the rate in <K>CSV sample rate (Hz)</K>.</li>
        </UL>
        <P>
          After loading, the <K>Channels</K> table lists each record. Select the orange circle under <strong>Input</strong> for the input (one channel) and the checkboxes under <strong>Output</strong> for the
          responses (as many as you like: all of them will be computed against the same input). With exactly two records, PySQA already marks the first as the input and the second as the output.
          FRFs that already come in a UFF file appear under <K>Measured FRFs in the files</K> and are drawn as they are, with no need for an input.
        </P>
        <Callout kind="info" title="Records and the server">
          The records are kept on the server during the session (up to 30 minutes without use), and the browser keeps the original files. If the server restarts, PySQA re-uploads them
          by itself and redoes the calculation. All records of an analysis must have the same sample rate.
        </Callout>
      </Section>

      <Section id="estimar" title="Estimating the FRF">
        <Section id="e-welch" title="Averaging for continuous signals (Welch)" level={3}>
          <P>
            For long-lasting excitations (random noise from a shaker, a sweep), the record is split into overlapping <strong>blocks</strong>; each block is windowed
            and passed through the FFT, and the spectra are <strong>averaged</strong> across blocks. This is the idea of Welch's method <Cite ids={['welch1967']} />: averaging reduces the noise of the estimate,
            and the overlap makes good use of the data.
          </P>
          <UL>
            <li><strong>Block length:</strong> the block size sets the frequency resolution (Δf = fs / N). Long blocks separate close modes better but give fewer averages, and the block must be longer than the response of the system.</li>
            <li><strong>Overlap:</strong> 50% by default. With a Hann window, 50 to 75% makes good use of the data.</li>
            <li><strong>Window:</strong> Hann by default <Cite ids={['harris1978']} />. The flat-top measures peak heights better; the rectangular is only suitable for signals that fit exactly in the block.</li>
          </UL>
          <Figure n={1} title="Resolution, block duration and number of averages. Adjust the sample rate, the block and the recording duration." source="PySQA (simulation on this page)."
            note="Block length and recording duration are a trade-off: to get many averages with long blocks, you need to record for longer.">
            <ResolutionDemo />
          </Figure>
        </Section>

        <Section id="e-estimadores" title="H1, H2 and Hv estimators" level={3}>
          <P>
            Real measurements are noisy. Depending on where the noise is, one way of computing the FRF is better than another <Cite ids={['brandt2011', 'bendat2010']} />. With the averaged spectra of the
            input (S<sub>xx</sub>), the output (S<sub>yy</sub>) and the cross-spectrum (S<sub>xy</sub>):
          </P>
          <Eq n={2} where={<>S<sub>xy</sub> = E[X*·Y]: the average cross-spectrum between input and output; S<sub>xx</sub> and S<sub>yy</sub>, the auto-spectra.</>}>
            <span>H1 = S<sub>xy</sub> / S<sub>xx</sub></span><br />
            <span>H2 = S<sub>yy</sub> / S<sub>yx</sub></span>
          </Eq>
          <UL>
            <li><strong>H1:</strong> the best choice when the noise is on the <em>output</em>. If the input is noisy, H1 <em>underestimates</em> the FRF, mainly at the peaks.</li>
            <li><strong>H2:</strong> better when the noise is on the <em>input</em>. With noise on the output, it <em>overestimates</em> (the noise adds to the output auto-spectrum).</li>
            <li><strong>Hv:</strong> uses the total least squares method, which assumes noise on both sides. Since input and output have different units, PySQA first puts them on the same scale (by the ratio of the mean powers). It lies between H1 and H2.</li>
          </UL>
          <Figure n={2} title="The three estimators when the force is very noisy (70% of its standard deviation), at the 213.6 Hz peak."
            source="PySQA (own calculation, simulated three-mode system, 240 s of random noise)."
            note="The dashed line is the true FRF. H1 is almost 4 dB below it, because the noise on the input inflates the denominator; H2 and Hv stay very close to the true curve.">
            <EstimatorsChart />
          </Figure>
          <Callout kind="tip">A good routine is to compute H1 and H2 and compare them. If they are nearly equal, the noise is small; if they differ a lot, be suspicious of the measurement.</Callout>
        </Section>

        <Section id="e-coerencia" title="Coherence: the confidence meter" level={3}>
          <P>
            Coherence measures, frequency by frequency, the fraction of the response that can be explained by the input <Cite ids={['bendat2010']} />. It ranges from 0 to 1:
          </P>
          <Eq n={3}>γ²(f) = |S<sub>xy</sub>|² / ( S<sub>xx</sub> · S<sub>yy</sub> )</Eq>
          <UL>
            <li><strong>Close to 1:</strong> the output comes from the input you measured; the FRF is reliable.</li>
            <li><strong>Below 0.8:</strong> there is noise, nonlinearity, other excitation sources or spectral leakage. Be suspicious of that band.</li>
            <li><strong>Expected dips:</strong> at the <em>antiresonances</em> (the valleys) the response is small and the noise weighs more, so the coherence naturally drops.</li>
          </UL>
          <Callout kind="warn">Coherence can only be computed with <strong>two or more averages</strong>. With a single one, PySQA warns and does not show it.</Callout>
          <Figure n={3} title="FRF (accelerance), phase and coherence of a three-mode system, measured with random noise."
            source="PySQA (own calculation, H1 estimator, 119 averages, 240 s recording)."
            note="The result matches the true curve (dashed) at the peaks; the coherence stays close to 1, with dips in the valleys between the modes.">
            <BodeCoherenceChart />
          </Figure>
        </Section>
      </Section>

      <Section id="impacto" title="Impact hammer testing">
        <P>
          In an impact test, the excitation is a short hit. PySQA finds the hits, extracts a block around each one, computes the spectrum of each block and averages them,
          as in the impact mobility standard <Cite ids={['iso76265', 'ewins2000']} />.
        </P>
        <UL>
          <li><strong>Trigger level (default 20% of the peak):</strong> a hit is the first instant at which the force reaches this fraction of its maximum value. Hits less than one block apart (double hits) are ignored.</li>
          <li><strong>Pre-trigger (default 5% of the block):</strong> the part of the block that comes before the hit, so the start of the signal is not cut off and the rest level (which is subtracted) can be estimated.</li>
          <li><strong>Force window (default 8 ms):</strong> the force is set to zero after this time, which removes the hammer's background noise after the hit.</li>
          <li><strong>Exponential window (default 1%):</strong> an exponential window on the response that makes it reach this percentage at the end of the block, so that it ends at zero and is not truncated.</li>
        </UL>
        <Figure n={4} title="The two windows of the impact test. Change the force window and the end of the exponential and see the damping it adds."
          source="PySQA (simulation on this page; 100 Hz mode with ζ = 2%)." note="The exponential is a useful tool, but it “fools” the damping: PySQA knows the rate it used and subtracts it from the estimate.">
          <ImpactWindowsDemo />
        </Figure>
        <Callout kind="warn" title="If no hit is found">
          PySQA warns and suggests lowering the <K>Trigger level</K>, checking the excitation channel or switching to <K>Random / continuous</K>. A record with a single hit has only one average,
          and the coherence cannot be computed: combine several hits.
        </Callout>
      </Section>

      <Section id="vistas" title="Result views">
        <UL>
          <li><strong>Bode:</strong> the FRF magnitude in dB, the phase in degrees and, below, the coherence, with a logarithmic or linear frequency axis. Each response has its own color. <K>Unwrap phase</K> unwraps the phase (no 360° jumps).</li>
          <li><strong>Real / Imag:</strong> the real and imaginary parts. Good for seeing the shape of each resonance: the imaginary part peaks at the resonance.</li>
          <li><strong>Nyquist:</strong> the imaginary part against the real part. Each mode draws a circle (figure below); well-separated modes are separate circles.</li>
          <li><strong>Modes:</strong> the mode indicator with the peaks marked and the results table.</li>
        </UL>
        <Figure n={5} title="Nyquist diagram of the receptance of one mode (100 Hz, ζ = 3%). The circle is traversed clockwise, from right to left, as the frequency rises."
          source="PySQA (simulation on this page)." note="When passing through the resonance, the point crosses the lowest point of the circle, where the imaginary part is largest in magnitude.">
          <NyquistModeChart />
        </Figure>
        <P>
          <K>Frequency range</K> restricts the range displayed and analyzed (zero frequency is never shown). The useful range is limited at the top by the Nyquist frequency and at the bottom
          by the block resolution.
        </P>
      </Section>

      <Section id="modos" title="Modes and damping">
        <Section id="m-deteccao" title="Finding the peaks" level={3}>
          <P>
            With several responses, which curve should be used to find the peaks? PySQA combines them all into the <strong>mode indicator function</strong> (MIF):
          </P>
          <Eq n={4} where={<>H<sub>i</sub>(f): the FRF of response i. With a single response, the MIF is simply the FRF magnitude.</>}>
            MIF(f) = √( Σ<sub>i</sub> |H<sub>i</sub>(f)|² )
          </Eq>
          <P>
            A mode shows up as a peak in the MIF even if it is barely visible in one of the responses (for example, near a node of that response's mode shape).
            PySQA looks for peaks in the curve in dB:
          </P>
          <UL>
            <li><strong>Peak prominence (default 6 dB):</strong> how much the peak must stand out from the surrounding valley. Raise it to ignore noise; lower it to see weak modes.</li>
            <li><strong>Min. spacing:</strong> minimum distance between two peaks (default: two FFT lines, at least 1 Hz).</li>
            <li>At most 12 modes, the most prominent ones. The frequency of each peak is refined by parabolic interpolation between the neighboring lines.</li>
          </UL>
          <Figure n={6} title="Mode indicator of the simulated system, with the three detected modes." source="PySQA (own calculation).">
            <ModesFoundChart />
          </Figure>
        </Section>

        <Section id="m-amortecimento" title="Measuring the damping" level={3}>
          <P>
            <strong>Damping</strong> tells how quickly the vibration dies out. It is given by the damping ratio ζ (a dimensionless number, in %) or, equivalently,
            by the quality factor Q = 1 / (2ζ): the sharper the peak, the higher the Q. PySQA gives two estimates <Cite ids={['ewins2000']} />:
          </P>
          <P><strong>1. Half-power method (−3 dB).</strong> The width of the peak is measured at 70.7% of the maximum (−3 dB):</P>
          <Eq n={5} where={<>f<sub>1</sub> and f<sub>2</sub>: the frequencies, before and after the peak, at which the magnitude drops to 1/√2 of the maximum; f<sub>n</sub>: the peak frequency.</>}>
            ζ ≈ ( f<sub>2</sub> − f<sub>1</sub> ) / ( 2 · f<sub>n</sub> )
          </Eq>
          <Figure n={7} title="The half-power method. Increase the damping and watch the width of the peak grow."
            source="PySQA (simulation on this page)." note="The approximation is excellent for low damping (generally up to a few percent) and drifts away as the damping increases.">
            <HalfPowerDemo />
          </Figure>
          <P>
            <strong>2. Single-mode fit.</strong> Around the peak, PySQA fits to the measured FRF the theoretical curve of a single-degree-of-freedom system,
            with the natural frequency and the damping as unknowns (shared by all responses) and a constant term that represents the influence of the neighboring modes.
            This fit uses the points of the whole curve, not just two, so it is more robust to noise and also works when modes are close.
            The <K>Damping ζ (%)</K> value shown in the table is the one from the fit when it converges, and the half-power one otherwise.
          </P>
          <Callout kind="info" title="Exponential window correction">
            In the impact test, the exponential window adds artificial damping. PySQA subtracts this addition (k / ω<sub>n</sub>) from the values shown.
          </Callout>
          <Callout kind="warn" title="When to distrust the damping">
            PySQA adds a warning to the mode when: the peak has few lines (fewer than 3 within the −3 dB width: use a longer block), there is another mode so
            close that the width cannot be measured, or the coherence at the peak is below 0.8.
          </Callout>
        </Section>

        <Section id="m-verificacao" title="Checking against the simulated system" level={3}>
          <P>
            To find out whether PySQA gets it right, a measurement was generated from a simulated system whose modes are known, with measurement noise, and the result was compared
            with the true value. The table shows the true and estimated frequencies and damping, both with random noise and with nine hammer hits (with the exponential window correction).
          </P>
          <ModesCheckTable />
          <p className="text-[12px] text-muted max-w-[72ch]">
            Source: PySQA (own calculation). Measurement of 240 s of random noise (8,192-sample block at 2,048 Hz, 0.25 Hz resolution) and of 40 s with nine hits. The differences in frequency are below 0.02 Hz,
            and those in damping from the fit are at most 3.5% of the true value (in the worst mode).
          </p>
          <Callout kind="tip">
            True values are not known in a real measurement. As a check, repeat the measurement, compare H1 and H2 and see whether the ζ from the fit and the half-power one agree: when they disagree a lot, something
            (noise, close modes, resolution) is getting in the way.
          </Callout>
        </Section>
      </Section>

      <Section id="exportacao" title="Export">
        <UL>
          <li><strong>FRF CSV:</strong> one row per frequency, with, for each response, magnitude (dB), phase (°), real part, imaginary part and coherence.</li>
          <li><strong>Modes CSV:</strong> one row per mode: frequency, damping (%) total, from the half-power and from the fit, Q, −3 dB bandwidth, coherence at the peak and level.</li>
        </UL>
      </Section>

      <Section id="limites" title="Limits and good practices">
        <UL>
          <li><strong>Linear, stationary system.</strong> The FRF only describes well systems that respond in proportion to the force and do not change during the measurement. Low coherence across the whole range suggests nonlinearity.</li>
          <li><strong>Resolution versus averages.</strong> The block must be longer than the decay time of the response, and the record must contain many blocks. See Figure 1.</li>
          <li><strong>Leakage.</strong> If the response does not die out within the block, use an exponential window (impact) or more overlap and a Hann window (continuous).</li>
          <li><strong>Clean hits.</strong> Avoid double hits; check the force window. A hard hit excites more high frequencies, a soft one fewer.</li>
          <li><strong>Sensors.</strong> PySQA does not apply the sensors' sensitivity: use signals already in engineering units (N, m/s²) or remember that the FRF is in the units of the file.</li>
          <li><strong>Close modes.</strong> If two peaks merge, the half-power method fails; trust the fit and increase the resolution.</li>
          <li><strong>Server limits.</strong> The server stores a limited number of records per session and reports if they do not fit.</li>
        </UL>
      </Section>

      <Section id="referencias" title="References">
        <Bibliography />
      </Section>
    </article>
  )
}

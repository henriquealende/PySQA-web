import Plot from '../../components/Plot'
import type { FrfMode, FrfResult } from '../../api/frfApi'
import { useT } from '../../i18n'
import { LEGEND_INSIDE } from '../../components/plotLegend'

export type FrfView = 'bode' | 'complex' | 'nyquist' | 'modes'

export const CURVE_COLORS = ['#50b89e', '#ed693b', '#ffa94d', '#60a5fa', '#c084fc', '#f472b6', '#a3e635', '#22d3ee']

const AXIS = { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9', linecolor: '#2b3c50' }

const BASE: any = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#111c28',
  font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
  margin: { l: 62, r: 16, t: 24, b: 48 },
  autosize: true,
  hovermode: 'x',
  hoverlabel: { bgcolor: '#1c2a38', bordercolor: '#50b89e', font: { color: 'white', size: 11 } },
  legend: LEGEND_INSIDE,
  modebar: { orientation: 'h', bgcolor: 'rgba(17,28,40,0.75)', color: '#8ab4c9', activecolor: '#50b89e' },
}

const CONFIG = {
  displayModeBar: true,
  modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d', 'toggleSpikelines'] as any,
  displaylogo: false,
  responsive: true,
}

function modeShapes(modes: FrfMode[] | undefined, show: boolean, xLog: boolean) {
  if (!show || !modes) return { shapes: [], annotations: [] }
  return {
    shapes: modes.map((m) => ({
      type: 'line', xref: 'x', yref: 'paper', x0: m.fn_hz, x1: m.fn_hz, y0: 0, y1: 1,
      line: { color: 'rgba(255,169,77,0.55)', width: 1, dash: 'dot' },
    })),
    annotations: modes.map((m, i) => ({
      x: xLog ? Math.log10(m.fn_hz) : m.fn_hz, xref: 'x', y: 1, yref: 'paper', yanchor: 'bottom', showarrow: false,
      text: `${i + 1}`, font: { size: 9, color: '#ffa94d' },
    })),
  }
}

/** Plots of one FRF result. The parent decides what to show; nothing here talks to the server. */
export default function FrfPlots({ result, view, xLog, showModes }: {
  result: FrfResult; view: FrfView; xLog: boolean; showModes: boolean
}) {
  const t = useT()
  const f = result.freqs
  const curves = result.responses
  const xType = xLog ? 'log' : 'linear'
  const hasCoh = result.coherence_valid && curves.every((c) => c.coherence)
  const { shapes, annotations } = modeShapes(result.modes, showModes, xLog)
  const multi = curves.length > 1
  const col = (i: number) => CURVE_COLORS[i % CURVE_COLORS.length]
  const unwrapped = curves[0]?.phase_deg.some((p) => Math.abs(p) > 180)

  if (view === 'bode') {
    const mag = curves.map((c, i) => ({ x: f, y: c.mag_db, name: c.name, type: 'scatter', mode: 'lines',
      line: { color: col(i), width: 1.4 }, xaxis: 'x', yaxis: 'y', legendgroup: c.id }))
    const ph = curves.map((c, i) => ({ x: f, y: c.phase_deg, name: c.name, type: 'scatter', mode: 'lines',
      line: { color: col(i), width: 1.2 }, xaxis: 'x2', yaxis: 'y2', legendgroup: c.id, showlegend: false }))
    const co = hasCoh ? curves.map((c, i) => ({ x: f, y: c.coherence, name: c.name, type: 'scatter', mode: 'lines',
      line: { color: col(i), width: 1 }, xaxis: 'x3', yaxis: 'y3', legendgroup: c.id, showlegend: false })) : []
    const d = hasCoh ? { mag: [0.55, 1], ph: [0.27, 0.5], co: [0, 0.21] } : { mag: [0.5, 1], ph: [0, 0.44], co: [0, 0] }
    const layout = {
      ...BASE, shapes, annotations, showlegend: multi,
      xaxis: { ...AXIS, type: xType, anchor: 'y', showticklabels: false },
      yaxis: { ...AXIS, domain: d.mag, title: { text: `${result.quantity} (dB)` } },
      xaxis2: { ...AXIS, type: xType, anchor: 'y2', matches: 'x', showticklabels: !hasCoh, title: hasCoh ? undefined : { text: t('sa.plots.frequency') } },
      yaxis2: { ...AXIS, domain: d.ph, title: { text: t('sa.plots.phase') }, ...(unwrapped ? {} : { range: [-190, 190], dtick: 90 }) },
      ...(hasCoh ? {
        xaxis3: { ...AXIS, type: xType, anchor: 'y3', matches: 'x', title: { text: t('sa.plots.frequency') } },
        yaxis3: { ...AXIS, domain: d.co, title: { text: t('sa.plots.coherence') }, range: [0, 1.02], dtick: 0.5 },
      } : {}),
    }
    return <Plot data={[...mag, ...ph, ...co] as any} layout={layout} config={CONFIG} useResizeHandler
      className="w-full h-full" style={{ width: '100%', height: '100%' }} />
  }

  if (view === 'complex') {
    const re = curves.map((c, i) => ({ x: f, y: c.real, name: c.name, type: 'scatter', mode: 'lines',
      line: { color: col(i), width: 1.3 }, xaxis: 'x', yaxis: 'y', legendgroup: c.id }))
    const im = curves.map((c, i) => ({ x: f, y: c.imag, name: c.name, type: 'scatter', mode: 'lines',
      line: { color: col(i), width: 1.3 }, xaxis: 'x2', yaxis: 'y2', legendgroup: c.id, showlegend: false }))
    const layout = {
      ...BASE, shapes, annotations, showlegend: multi,
      xaxis: { ...AXIS, type: xType, anchor: 'y', showticklabels: false },
      yaxis: { ...AXIS, domain: [0.54, 1], title: { text: t('sa.plots.real') }, exponentformat: 'power' },
      xaxis2: { ...AXIS, type: xType, anchor: 'y2', matches: 'x', title: { text: t('sa.plots.frequency') } },
      yaxis2: { ...AXIS, domain: [0, 0.46], title: { text: t('sa.plots.imaginary') }, exponentformat: 'power' },
    }
    return <Plot data={[...re, ...im] as any} layout={layout} config={CONFIG} useResizeHandler
      className="w-full h-full" style={{ width: '100%', height: '100%' }} />
  }

  if (view === 'nyquist') {
    const data = curves.map((c, i) => ({ x: c.real, y: c.imag, name: c.name, type: 'scatter', mode: 'lines',
      line: { color: col(i), width: 1.3 }, text: f.map((v) => `${v.toFixed(1)} Hz`), hovertemplate: `%{text}<br>${t('sa.plots.re')} %{x:.3g}<br>${t('sa.plots.im')} %{y:.3g}<extra>%{fullData.name}</extra>` }))
    const layout = {
      ...BASE, showlegend: multi, hovermode: 'closest',
      xaxis: { ...AXIS, title: { text: t('sa.plots.real') }, exponentformat: 'power' },
      yaxis: { ...AXIS, title: { text: t('sa.plots.imaginary') }, scaleanchor: 'x', exponentformat: 'power' },
    }
    return <Plot data={data as any} layout={layout} config={CONFIG} useResizeHandler
      className="w-full h-full" style={{ width: '100%', height: '100%' }} />
  }

  // modes: the mode indicator function with the picked peaks
  const mif = result.mif_db ?? []
  const modes = result.modes ?? []
  const data: any[] = [
    { x: f, y: mif, name: curves.length > 1 ? t('sa.plots.mif') : curves[0]?.name ?? 'FRF', type: 'scatter', mode: 'lines',
      line: { color: '#50b89e', width: 1.5 } },
    { x: modes.map((m) => m.fn_hz), y: modes.map((m) => m.level_db), type: 'scatter', mode: 'markers+text', name: t('sa.plots.modes'),
      marker: { color: '#ffa94d', size: 9, symbol: 'diamond' }, text: modes.map((_, i) => `${i + 1}`), textposition: 'top center',
      textfont: { color: '#ffa94d', size: 10 },
      hovertemplate: modes.map((m) => `${m.fn_hz.toFixed(2)} Hz` + (m.zeta != null ? `<br>ζ = ${(m.zeta * 100).toFixed(2)} %` : '')).map((h) => h + '<extra></extra>') },
  ]
  const layout = {
    ...BASE, showlegend: true,
    xaxis: { ...AXIS, type: xType, title: { text: t('sa.plots.frequency') } },
    yaxis: { ...AXIS, title: { text: `${result.quantity} (dB)` } },
  }
  return <Plot data={data} layout={layout} config={CONFIG} useResizeHandler
    className="w-full h-full" style={{ width: '100%', height: '100%' }} />
}

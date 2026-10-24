import Plot from '../../components/Plot'
import type { NoiseSpectrum } from '../../api/auralizationApi'
import { useT } from '../../i18n'
import { LEGEND_INSIDE } from '../../components/plotLegend'

const AXIS = { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9', linecolor: '#2b3c50' }
const COLORS = ['white', 'pink', 'brown'] as const

/** The signal and the noise in 1/3-octave bands, so the SNR can be read band by band. Nothing here talks to the server. */
export default function NoisePlot({ data }: { data: NoiseSpectrum | null }) {
  const t = useT()
  if (!data) return <div className="h-[240px] flex items-center justify-center text-xs text-muted">{t('aur.noise.plot.loading')}</div>
  const line = (y: number[], name: string, color: string, width: number, dash?: string) => ({
    x: data.freq, y, name, type: 'scatter', mode: 'lines', line: { color, width, dash },
    hovertemplate: `%{x:.0f} Hz<br>%{y:.1f} dB<extra>${name}</extra>`,
  })
  const traces = [line(data.signal_db, t('aur.noise.plot.signal'), '#50b89e', 2.2)]
  for (const c of COLORS) {
    const chosen = data.selected === c
    traces.push(line(data.noises[c], `${t('aur.noise.plot.noise')} ${t(`aur.noise.type.${c}`).toLowerCase()}`, chosen ? '#ed693b' : '#55728d', chosen ? 2.2 : 1.2, chosen ? undefined : 'dot'))
  }
  // a window of 90 dB under the loudest band: bands with no energy at all (-200 dB) would flatten everything else
  const top = Math.ceil(Math.max(...traces.flatMap((tr) => tr.y).filter(Number.isFinite))) + 5
  return (
    <Plot
      data={traces as any}
      layout={{
        paper_bgcolor: 'transparent', plot_bgcolor: '#111c28', autosize: true, height: 240,
        margin: { l: 52, r: 12, t: 8, b: 44 },
        font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
        xaxis: { ...AXIS, type: 'log', title: { text: t('aur.plot.freq') }, range: [Math.log10(20), Math.log10(data.freq[data.freq.length - 1] * 1.05)] },
        yaxis: { ...AXIS, title: { text: t('aur.noise.plot.y') }, range: [top - 90, top] },
        legend: LEGEND_INSIDE,
        hovermode: 'x unified',
      } as any}
      config={{ displaylogo: false, displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}

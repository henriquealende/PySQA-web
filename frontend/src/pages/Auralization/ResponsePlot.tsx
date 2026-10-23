import Plot from '../../components/Plot'
import type { HrtfResponse } from '../../api/auralizationApi'
import { useT } from '../../i18n'

const LEFT = '#50b89e'
const RIGHT = '#ed693b'
const AXIS = { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9', linecolor: '#2b3c50' }

/** Magnitude of the left and right ear for the chosen direction. Nothing here talks to the server. */
export default function ResponsePlot({ data }: { data: HrtfResponse | null }) {
  const t = useT()
  if (!data) return <div className="h-[220px] flex items-center justify-center text-xs text-muted">{t('aur.plot.loading')}</div>
  const mk = (y: number[], name: string, color: string) => ({
    x: data.freq, y, name, type: 'scatter', mode: 'lines', line: { color, width: 1.6 },
    hovertemplate: `%{x:.0f} Hz<br>%{y:.1f} dB<extra>${name}</extra>`,
  })
  return (
    <Plot
      data={[mk(data.left_db, t('aur.plot.left'), LEFT), mk(data.right_db, t('aur.plot.right'), RIGHT)] as any}
      layout={{
        paper_bgcolor: 'transparent', plot_bgcolor: '#111c28', autosize: true, height: 220,
        margin: { l: 52, r: 12, t: 8, b: 44 },
        font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
        xaxis: { ...AXIS, type: 'log', title: { text: t('aur.plot.freq') }, range: [Math.log10(100), Math.log10(data.freq[data.freq.length - 1])] },
        yaxis: { ...AXIS, title: { text: t('aur.plot.mag') } },
        legend: { orientation: 'h', y: 1.15, x: 0, font: { size: 10, color: '#8ab4c9' }, bgcolor: 'transparent' },
        hovermode: 'x unified',
      } as any}
      config={{ displaylogo: false, displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}

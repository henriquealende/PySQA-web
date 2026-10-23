import Plot from '../../components/Plot'
import type { RirInfo } from '../../api/auralizationApi'
import { useT } from '../../i18n'

const AXIS = { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9', linecolor: '#2b3c50' }

/** Energy decay curve of a room response (Schroeder backward integral). Nothing here talks to the server. */
export default function DecayPlot({ info }: { info: RirInfo | null }) {
  const t = useT()
  if (!info || !info.decay.t.length) {
    return <div className="h-[180px] flex items-center justify-center text-xs text-muted">{t('aur.env.noDecay')}</div>
  }
  return (
    <Plot
      data={[{
        x: info.decay.t, y: info.decay.db, type: 'scatter', mode: 'lines', line: { color: '#50b89e', width: 1.6 },
        hovertemplate: '%{x:.2f} s<br>%{y:.1f} dB<extra></extra>',
      }] as any}
      layout={{
        paper_bgcolor: 'transparent', plot_bgcolor: '#111c28', autosize: true, height: 180,
        margin: { l: 52, r: 12, t: 8, b: 40 },
        font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
        xaxis: { ...AXIS, title: { text: t('aur.env.decayX') } },
        yaxis: { ...AXIS, title: { text: t('aur.env.decayY') }, range: [-70, 3] },
        showlegend: false, hovermode: 'x',
      } as any}
      config={{ displaylogo: false, displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}

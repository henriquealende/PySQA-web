import Plot from '../../components/Plot'
import type { HeadphoneResponse } from '../../api/auralizationApi'
import { useT } from '../../i18n'
import { LEGEND_INSIDE } from '../../components/plotLegend'

const AXIS = { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9', linecolor: '#2b3c50' }

/** The headphone as measured, the filter that is applied and (when compensating) what is left. Nothing here talks to the server. */
export default function HeadphonePlot({ data, mode }: { data: HeadphoneResponse | null; mode: 'compensate' | 'simulate' }) {
  const t = useT()
  if (!data) return <div className="h-[220px] flex items-center justify-center text-xs text-muted">{t('aur.hp.loading')}</div>
  const line = (y: number[], name: string, color: string, dash?: string) => ({
    x: data.freq, y, name, type: 'scatter', mode: 'lines', line: { color, width: 1.6, dash },
    hovertemplate: `%{x:.0f} Hz<br>%{y:.1f} dB<extra>${name}</extra>`,
  })
  const traces = [line(data.measured_db, t('aur.hp.measured'), '#ed693b'), line(data.filter_db, t('aur.hp.filter'), '#50b89e')]
  if (mode === 'compensate' && data.result_db) traces.push(line(data.result_db, t('aur.hp.result'), '#e2e8f0', 'dot'))
  return (
    <Plot
      data={traces as any}
      layout={{
        paper_bgcolor: 'transparent', plot_bgcolor: '#111c28', autosize: true, height: 220,
        margin: { l: 52, r: 12, t: 8, b: 44 },
        font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
        xaxis: { ...AXIS, type: 'log', title: { text: t('aur.plot.freq') }, range: [Math.log10(20), Math.log10(data.freq[data.freq.length - 1])] },
        yaxis: { ...AXIS, title: { text: t('aur.plot.mag') } },
        legend: LEGEND_INSIDE,
        hovermode: 'x unified',
      } as any}
      config={{ displaylogo: false, displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}

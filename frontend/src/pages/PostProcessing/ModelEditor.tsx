import { Trash2, X } from 'lucide-react'
import type { BatchModel, MetricKey } from '../../types'
import NumberInput from '../../components/NumberInput'
import { MODEL_METRICS, describeModel, silPreset } from '../../utils/batchModels'
import { useT, currentLocale } from '../../i18n'

/** Edits a user-defined linear model: result = intercept + Σ weight · global value of each metric. */
export default function ModelEditor({ model, labelOf, shortOf, onChange, onDelete, onClose }: {
  model: BatchModel
  labelOf: (k: MetricKey) => string
  shortOf: (k: MetricKey) => string
  onChange: (patch: Partial<BatchModel>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const t = useT()
  const setWeight = (k: MetricKey, v: number | null) => {
    const weights = { ...model.weights }
    if (v == null || v === 0) delete weights[k]
    else weights[k] = v
    onChange({ weights })
  }
  const field = 'bg-dark border border-field rounded px-2 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal'

  return (
    <div className="rounded-lg border border-amber-500/40 bg-panel/60 p-3 flex flex-col gap-3" role="group" aria-label={t('pp.batch.modelEdit')}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t('pp.batch.modelName')}
          <input value={model.name} maxLength={40} onChange={e => onChange({ name: e.target.value })} className={`${field} w-48`} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t('pp.batch.modelUnit')}
          <input value={model.unit} maxLength={16} onChange={e => onChange({ unit: e.target.value })} className={`${field} w-24`} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t('pp.batch.modelIntercept')}
          <NumberInput value={model.intercept} onChange={v => onChange({ intercept: v ?? 0 })} title={t('pp.batch.modelIntercept')} className="w-24 !py-1 !text-xs" />
        </label>
        <div className="flex-1" />
        <button onClick={() => onChange(silPreset())}
          className="px-2.5 py-1 text-xs rounded border border-border text-muted hover:text-white hover:bg-panel transition-colors">
          {t('pp.batch.modelFromSil')}
        </button>
        <button onClick={onDelete} aria-label={t('pp.batch.modelDelete')} title={t('pp.batch.modelDelete')}
          className="p-1.5 rounded text-muted hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
        <button onClick={onClose} aria-label={t('pp.batch.modelClose')} title={t('pp.batch.modelClose')}
          className="p-1.5 rounded text-muted hover:text-white transition-colors"><X size={14} /></button>
      </div>

      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        {MODEL_METRICS.map(k => (
          <label key={k} className="flex items-center gap-2 text-xs text-muted">
            <span className="flex-1 truncate" title={labelOf(k)}>{labelOf(k)}</span>
            <NumberInput value={model.weights[k] ?? null} onChange={v => setWeight(k, v)} placeholder="0" title={`${t('pp.batch.modelWeight')}: ${labelOf(k)}`} className="w-20 !py-1 !text-xs" />
          </label>
        ))}
      </div>

      <p className="text-[11px] text-muted">
        <span className="text-amber-400 font-mono">{model.name || t('pp.batch.modelUnnamed')} = {describeModel(model, shortOf, currentLocale())}</span>
        <br />{t('pp.batch.modelNote')}
      </p>
    </div>
  )
}

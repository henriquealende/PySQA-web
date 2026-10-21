import { apiFetch, errorText } from './http'

const BASE = '/api/export'

export function getWavUrl(sessionId: string, audioId: string): string {
  return `${BASE}/wav/${sessionId}/${audioId}`
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  URL.revokeObjectURL(url)
}

/** File-name friendly version of a label: "1/3-octave bands" → "1-3-octave-bands". */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export'
}

export async function exportXlsx(
  sessionId: string, audioIds: string[], plotData: any[], fileName = 'pysqa_export.xlsx',
): Promise<void> {
  const res = await apiFetch(sessionId, `${BASE}/xlsx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, audio_ids: audioIds, plot_data: plotData }),
  })
  if (!res.ok) throw new Error(await errorText(res))
  downloadBlob(await res.blob(), fileName)
}

// ── CSV is made in the browser: no upload, no size limit ──────────────────────

type Cell = number | string | null | undefined

const quote = (v: Cell): string => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvFromColumns(columns: Record<string, Cell[]>): string {
  const names = Object.keys(columns)
  const rows = Math.max(0, ...names.map((n) => columns[n].length))
  const out = [names.map(quote).join(',')]
  for (let i = 0; i < rows; i++) out.push(names.map((n) => quote(columns[n][i])).join(','))
  return out.join('\r\n')
}

export function downloadCsv(columns: Record<string, Cell[]>, fileName: string): void {
  // The byte order mark makes Excel read accents and symbols (µ, °) correctly
  downloadBlob(new Blob(['﻿', csvFromColumns(columns)], { type: 'text/csv;charset=utf-8' }), fileName)
}

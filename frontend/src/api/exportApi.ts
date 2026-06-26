const BASE = '/api/export'

export function getWavUrl(sessionId: string, audioId: string): string {
  return `${BASE}/wav/${sessionId}/${audioId}`
}

export async function exportXlsx(sessionId: string, audioIds: string[], plotData: any[]): Promise<void> {
  const res = await fetch(`${BASE}/xlsx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, audio_ids: audioIds, plot_data: plotData }),
  })
  if (!res.ok) throw new Error(await res.text())
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'pysqa_export.xlsx'; a.click()
  URL.revokeObjectURL(url)
}

export async function exportCsv(sessionId: string, audioId: string, columns: Record<string, number[]>): Promise<void> {
  const res = await fetch(`${BASE}/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, audio_id: audioId, columns }),
  })
  if (!res.ok) throw new Error(await res.text())
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'pysqa_export.csv'; a.click()
  URL.revokeObjectURL(url)
}

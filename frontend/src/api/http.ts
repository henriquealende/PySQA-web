/**
 * One place for talking to the server.
 *
 * - A 404 on a session request usually means the server forgot the session: its disk is
 *   temporary, so a restart, a deploy or an out-of-memory kill wipes everything. The files
 *   are then put back from this browser's copy and the request is tried again, so the user
 *   never sees it.
 * - A request that stays pending for a while while the server does not answer /api/health
 *   means the instance is restarting (or waking up, on a plan that sleeps): the status
 *   banner says so.
 */
import type { AudioFile } from '../types'
import { useStore } from '../store/useStore'
import { toast } from '../store/useToast'
import { t } from '../i18n'
import * as recovery from './recovery'
import { errorText, SessionExpiredError } from './errors'

export { errorText, SessionExpiredError }

/** 16 hex characters. The browser picks the id of what it uploads so a restored file keeps it. */
export function newClientId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function checkResponse(res: Response): Promise<Response> {
  if (res.status === 404) throw new SessionExpiredError()
  if (!res.ok) throw new Error(await errorText(res))
  return res
}

// ── Is the server waking up? ──────────────────────────────────────────────────

const SLOW_MS = 6000
let slowCount = 0
let probing = false

async function pingHealth(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
    return res.ok
  } catch { return false } finally { window.clearTimeout(timer) }
}

async function probeServer() {
  if (probing) return
  probing = true
  try {
    while (slowCount > 0) {
      if (await pingHealth(4000)) break          // it answers: the request is only heavy, not a cold start
      useStore.getState().setServerWaking(true)
      await new Promise((r) => setTimeout(r, 3000))
    }
  } finally {
    useStore.getState().setServerWaking(false)
    probing = false
  }
}

/** Run a request; if it is still pending after a few seconds, find out whether the server is asleep. */
export async function watched<T>(run: () => Promise<T>): Promise<T> {
  let marked = false
  const timer = window.setTimeout(() => { marked = true; slowCount++; void probeServer() }, SLOW_MS)
  try { return await run() } finally {
    window.clearTimeout(timer)
    if (marked) slowCount--
  }
}

// ── Putting the session back ──────────────────────────────────────────────────

async function listServerFiles(sessionId: string): Promise<AudioFile[] | null> {
  try {
    const res = await watched(() => fetch(`/api/audio/list/${sessionId}`))
    return res.ok ? await res.json() : null
  } catch { return null }
}

let restoring: Promise<boolean> | null = null
let restoreEpoch = 0       // counts restores that put something back

async function doRestore(sessionId: string): Promise<boolean> {
  const serverFiles = await listServerFiles(sessionId)
  if (serverFiles === null) return false                      // cannot reach the server: nothing to compare with
  const missing = await recovery.missingRecords(sessionId, new Set(serverFiles.map((f) => f.audio_id)))
  if (!missing.length) return false

  const { setRestore } = useStore.getState()
  setRestore({ done: 0, total: missing.length })
  try {
    const result = await recovery.restoreRecords(sessionId, missing, (done) => setRestore({ done, total: missing.length }))
    if (result.failed.length) {
      toast.error(t('cal.api.restoreFailed', { names: result.failed.map((f) => f.name).join(', '), reason: result.failed[0].reason }))
    } else {
      toast.info(t(result.restored > 1 ? 'cal.api.restoredMany' : 'cal.api.restoredOne', { count: result.restored }))
    }
    if (result.restored > 0) restoreEpoch++
    return result.restored > 0
  } finally { setRestore(null) }
}

/** Single flight: requests that fail together share one restore. True if files were put back. */
export function restoreSession(sessionId: string): Promise<boolean> {
  if (!restoring) restoring = doRestore(sessionId).finally(() => { restoring = null })
  return restoring
}

/** fetch for session requests: on a 404, restore what the server lost and try once more. */
export async function apiFetch(sessionId: string, url: string, init?: RequestInit, recover = true): Promise<Response> {
  const epoch = restoreEpoch
  let res = await watched(() => fetch(url, init))
  if (recover && res.status === 404) {
    const restored = await restoreSession(sessionId)
    // a restore that finished while this request was in flight also counts
    if (restored || restoreEpoch !== epoch) res = await watched(() => fetch(url, init))
  }
  return res
}

// ── After a reload ────────────────────────────────────────────────────────────

let rehydrating: Promise<void> | null = null

async function doRehydrate() {
  const { sessionId } = useStore.getState()
  void recovery.pruneOldSessions(sessionId)

  const records = await recovery.recordsFor(sessionId)
  let files = await listServerFiles(sessionId)
  if (files === null) return
  const live = records.filter((r) => !r.deleted)
  // The server may have lost some or all of it (sleep, restart, idle expiry): put it back
  if (live.some((r) => !files!.some((f) => f.audio_id === r.audioId))) {
    if (await restoreSession(sessionId)) files = (await listServerFiles(sessionId)) ?? files
  }

  const hidden = new Set(records.filter((r) => r.deleted).map((r) => r.audioId))
  const order = new Map(records.map((r) => [r.audioId, r.seq]))
  const shown = files
    .filter((f) => !hidden.has(f.audio_id))
    .sort((a, b) => (order.get(a.audio_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.audio_id) ?? Number.MAX_SAFE_INTEGER))
  if (!shown.length) return

  const calibrations: Record<string, number | null> = {}
  live.forEach((r) => { if (r.calibration) calibrations[r.audioId] = r.calibration.sensitivityMvPa })
  useStore.getState().hydrate(shown, calibrations)
}

/** Bring the file list back after a page reload (or after the server lost it). Runs once. */
export function rehydrateSession(): Promise<void> {
  if (!rehydrating) rehydrating = doRehydrate().catch((e) => console.warn('[recovery] rehydrate failed:', e))
  return rehydrating
}

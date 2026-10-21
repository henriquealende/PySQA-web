/**
 * Keeps what is needed to rebuild a session on the server: the files the user uploaded
 * (as blobs) and the processing steps applied to them. A Render instance keeps its
 * sessions on a temporary disk and forgets them on every restart, deploy or out-of-memory
 * kill; with this, the app puts the files back on its own, under the same ids, so nothing
 * on screen has to change.
 *
 * Everything lives in this browser's IndexedDB and is never sent anywhere else.
 * Copies of sessions untouched for a week are deleted.
 */
import type { AudioFile } from '../types'
import { toast } from '../store/useToast'
import { errorText } from './errors'

const DB_NAME = 'pysqa-recovery'
const DB_VERSION = 1
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface Calibration { sensitivityMvPa: number; fsVoltage: number }

export interface RecoveryRecord {
  id: string                          // `${sessionId}:${audioId}`
  sessionId: string
  audioId: string
  seq: number                         // creation order: a file always comes after the files it was made from
  updatedAt: number
  name: string
  kind: 'upload' | 'derived'
  path?: string                       // derived: the endpoint that makes the file
  body?: Record<string, unknown>      // derived: the request, without session_id and new_audio_id
  parents: string[]                   // audio ids this file was made from
  calibration: Calibration | null
  deleted?: boolean                   // removed by the user but still needed to rebuild a descendant
}

// ── IndexedDB plumbing ────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null)
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          const records = req.result.createObjectStore('records', { keyPath: 'id' })
          records.createIndex('bySession', 'sessionId')
          req.result.createObjectStore('blobs')           // out-of-line key: the record id
        }
        req.onsuccess = () => {
          const db = req.result
          db.onversionchange = () => { db.close(); dbPromise = null }   // let another tab upgrade or delete the database
          resolve(db)
        }
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch { resolve(null) }
    })
  }
  return dbPromise
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

const keyOf = (sessionId: string, audioId: string) => `${sessionId}:${audioId}`

let lastSeq = 0
const nextSeq = () => (lastSeq = Math.max(Date.now(), lastSeq + 1))

let warned = false
function storageProblem(err: unknown) {
  console.warn('[recovery] could not keep a copy in this browser:', err)
  if (!warned) {
    warned = true
    toast.info("Couldn't keep a copy of your files in this browser, so they can't be restored automatically if the server restarts.")
  }
}

async function allRecords(db: IDBDatabase, sessionId: string): Promise<RecoveryRecord[]> {
  const rows = await reqP(db.transaction('records', 'readonly').objectStore('records').index('bySession').getAll(sessionId))
  return (rows as RecoveryRecord[]).sort((a, b) => a.seq - b.seq)
}

/** Ids the live (not deleted) records need, counting the files they were made from. */
function neededIds(all: RecoveryRecord[]): Set<string> {
  const byId = new Map(all.map((r) => [r.audioId, r]))
  const needed = new Set<string>()
  const visit = (id: string) => {
    if (needed.has(id)) return
    needed.add(id)
    byId.get(id)?.parents.forEach(visit)
  }
  all.filter((r) => !r.deleted).forEach((r) => visit(r.audioId))
  return needed
}

async function collectGarbage(db: IDBDatabase, sessionId: string) {
  const all = await allRecords(db, sessionId)
  const needed = neededIds(all)
  const drop = all.filter((r) => !needed.has(r.audioId))
  if (!drop.length) return
  const t = db.transaction(['records', 'blobs'], 'readwrite')
  drop.forEach((r) => { t.objectStore('records').delete(r.id); t.objectStore('blobs').delete(r.id) })
  await done(t)
}

// ── Recording what the user does ──────────────────────────────────────────────

export async function recordUpload(sessionId: string, uploaded: AudioFile, file: Blob): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const rec: RecoveryRecord = {
      id: keyOf(sessionId, uploaded.audio_id), sessionId, audioId: uploaded.audio_id,
      seq: nextSeq(), updatedAt: Date.now(), name: uploaded.name,
      kind: 'upload', parents: [], calibration: null,
    }
    const t = db.transaction(['records', 'blobs'], 'readwrite')
    t.objectStore('blobs').put(file, rec.id)
    t.objectStore('records').put(rec)
    await done(t)
  } catch (e) { storageProblem(e) }
}

export async function recordDerived(
  sessionId: string, result: AudioFile, path: string, body: Record<string, unknown>, parents: string[],
): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    // The server copies the parent's calibration into the new file; remember the same
    const parent = parents[0]
      ? await reqP(db.transaction('records', 'readonly').objectStore('records').get(keyOf(sessionId, parents[0]))) as RecoveryRecord | undefined
      : undefined
    const rec: RecoveryRecord = {
      id: keyOf(sessionId, result.audio_id), sessionId, audioId: result.audio_id,
      seq: nextSeq(), updatedAt: Date.now(), name: result.name,
      kind: 'derived', path, body, parents, calibration: parent?.calibration ?? null,
    }
    const t = db.transaction('records', 'readwrite')
    t.objectStore('records').put(rec)
    await done(t)
  } catch (e) { storageProblem(e) }
}

export async function recordCalibration(sessionId: string, audioId: string, calibration: Calibration | null): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const id = keyOf(sessionId, audioId)
    const rec = await reqP(db.transaction('records', 'readonly').objectStore('records').get(id)) as RecoveryRecord | undefined
    if (!rec) return
    const t = db.transaction('records', 'readwrite')
    t.objectStore('records').put({ ...rec, calibration, updatedAt: Date.now() })
    await done(t)
  } catch (e) { console.warn('[recovery] calibration not saved:', e) }
}

export async function recordDelete(sessionId: string, audioId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const id = keyOf(sessionId, audioId)
    const rec = await reqP(db.transaction('records', 'readonly').objectStore('records').get(id)) as RecoveryRecord | undefined
    if (!rec) return
    const t = db.transaction('records', 'readwrite')
    t.objectStore('records').put({ ...rec, deleted: true, updatedAt: Date.now() })
    await done(t)
    await collectGarbage(db, sessionId)
  } catch (e) { console.warn('[recovery] delete not saved:', e) }
}

export async function recordsFor(sessionId: string): Promise<RecoveryRecord[]> {
  const db = await openDb()
  if (!db) return []
  try { return await allRecords(db, sessionId) } catch { return [] }
}

export async function forgetSession(sessionId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const all = await allRecords(db, sessionId)
    const t = db.transaction(['records', 'blobs'], 'readwrite')
    all.forEach((r) => { t.objectStore('records').delete(r.id); t.objectStore('blobs').delete(r.id) })
    await done(t)
  } catch (e) { console.warn('[recovery] could not forget the session:', e) }
}

/** Delete the copies of sessions nobody has touched for a week (tabs that were closed long ago). */
export async function pruneOldSessions(keepSessionId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const rows = await reqP(db.transaction('records', 'readonly').objectStore('records').getAll()) as RecoveryRecord[]
    const newest = new Map<string, number>()
    rows.forEach((r) => newest.set(r.sessionId, Math.max(newest.get(r.sessionId) ?? 0, r.updatedAt)))
    const stale = rows.filter((r) => r.sessionId !== keepSessionId && Date.now() - (newest.get(r.sessionId) ?? 0) > MAX_AGE_MS)
    if (!stale.length) return
    const t = db.transaction(['records', 'blobs'], 'readwrite')
    stale.forEach((r) => { t.objectStore('records').delete(r.id); t.objectStore('blobs').delete(r.id) })
    await done(t)
  } catch (e) { console.warn('[recovery] pruning failed:', e) }
}

// ── Putting it back ───────────────────────────────────────────────────────────

const failedThisLoad = new Set<string>()      // do not retry, within this page load, what already failed

/** Records the server no longer has but the session still needs, parents first. */
export async function missingRecords(sessionId: string, serverIds: Set<string>): Promise<RecoveryRecord[]> {
  const all = await recordsFor(sessionId)
  const needed = neededIds(all)
  return all.filter((r) => needed.has(r.audioId) && !serverIds.has(r.audioId) && !failedThisLoad.has(r.audioId))
}

export interface RestoreResult {
  restored: number
  failed: { name: string; reason: string }[]
}

async function send(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(await errorText(res))
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function restoreRecords(
  sessionId: string, steps: RecoveryRecord[], onProgress: (done: number) => void,
): Promise<RestoreResult> {
  const db = await openDb()
  const result: RestoreResult = { restored: 0, failed: [] }
  const failedIds = new Set<string>()
  const hidden: string[] = []
  let count = 0

  for (const rec of steps) {
    try {
      if (rec.parents.some((p) => failedIds.has(p))) throw new Error('it depends on a file that could not be restored')

      if (rec.kind === 'upload') {
        const blob = db ? await reqP(db.transaction('blobs', 'readonly').objectStore('blobs').get(rec.id)) as Blob | undefined : undefined
        if (!blob) throw new Error('this browser no longer has a copy of the original file')
        const form = new FormData()
        form.append('session_id', sessionId)
        form.append('audio_ids', rec.audioId)
        form.append('files', new File([blob], rec.name, { type: 'audio/wav' }))
        await send('/api/audio/upload', { method: 'POST', body: form })
      } else {
        await send(rec.path!, {
          method: 'POST', headers: JSON_HEADERS,
          body: JSON.stringify({ ...rec.body, session_id: sessionId, new_audio_id: rec.audioId }),
        })
      }

      // A derived file inherits its parent's calibration when it is created; set it to what it had
      const calibrate = `/api/audio/${sessionId}/${rec.audioId}/calibrate`
      if (rec.calibration) {
        await send(calibrate, {
          method: 'POST', headers: JSON_HEADERS,
          body: JSON.stringify({ sensitivity_mv_pa: rec.calibration.sensitivityMvPa, fs_voltage: rec.calibration.fsVoltage }),
        })
      } else if (rec.kind === 'derived') {
        await send(calibrate, { method: 'DELETE' })
      }

      if (rec.deleted) hidden.push(rec.audioId)
      result.restored++
    } catch (e) {
      failedIds.add(rec.audioId)
      failedThisLoad.add(rec.audioId)
      result.failed.push({ name: rec.name, reason: (e as Error).message })
    }
    onProgress(++count)
  }

  // Files the user had removed were only rebuilt to serve as a base for others
  for (const id of hidden) await fetch(`/api/audio/${sessionId}/${id}`, { method: 'DELETE' }).catch(() => {})
  return result
}

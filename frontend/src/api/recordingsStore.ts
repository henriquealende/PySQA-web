/**
 * Recordings the user accepted in Data Acquisition, kept in this browser (IndexedDB) so that
 * leaving the page, reloading or closing the tab does not lose them. They are never sent
 * anywhere unless the user presses "send to Post-Processing".
 */
const DB_NAME = 'pysqa-recordings'
const DB_VERSION = 1

export interface StoredTake {
  id: string
  name: string
  blob: Blob
  durationSec: number
  bitDepth: number
  sr: number
  device: string
  capturedAt: string      // ISO date
  mode: string
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null)
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => { req.result.createObjectStore('takes', { keyPath: 'id' }) }
        req.onsuccess = () => {
          const db = req.result
          db.onversionchange = () => { db.close(); dbPromise = null }
          resolve(db)
        }
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch { resolve(null) }
    })
  }
  return dbPromise
}

function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

/** True if the take was stored (false when the browser has no storage or it is full). */
export async function saveTake(take: StoredTake): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const t = db.transaction('takes', 'readwrite')
    t.objectStore('takes').put(take)
    await done(t)
    return true
  } catch (e) {
    console.warn('[recordings] could not keep the take:', e)
    return false
  }
}

export async function deleteTake(id: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const t = db.transaction('takes', 'readwrite')
    t.objectStore('takes').delete(id)
    await done(t)
  } catch (e) { console.warn('[recordings] could not delete the take:', e) }
}

/** Every kept take, oldest first. */
export async function loadTakes(): Promise<StoredTake[]> {
  const db = await openDb()
  if (!db) return []
  try {
    const rows = await new Promise<StoredTake[]>((resolve, reject) => {
      const r = db.transaction('takes', 'readonly').objectStore('takes').getAll()
      r.onsuccess = () => resolve(r.result as StoredTake[])
      r.onerror = () => reject(r.error)
    })
    return rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  } catch (e) {
    console.warn('[recordings] could not read the kept takes:', e)
    return []
  }
}

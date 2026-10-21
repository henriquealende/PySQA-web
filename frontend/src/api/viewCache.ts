/**
 * Results of the analysis endpoints, kept in memory so that going back to a chart is instant, and shared
 * by identical requests that are in flight at the same time.
 *
 * A request is cancelled (and its network connection closed) only when nobody waits for it any more, so
 * two views asking for the same thing never cancel each other. Memory is bounded: the least recently used
 * results go first.
 */
interface Entry {
  promise: Promise<unknown>
  ctrl: AbortController
  waiters: number        // callers still waiting for the answer
  done: boolean
  size: number           // rough size of the result, in bytes
  audioId: string
}

const entries = new Map<string, Entry>()
let bytes = 0
const LIMIT_BYTES = 48 * 1024 * 1024

export const isAbort = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'AbortError'

function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

function evict() {
  for (const [key, e] of entries) {
    if (bytes <= LIMIT_BYTES || entries.size <= 1) break
    if (e.done) { entries.delete(key); bytes -= e.size }
  }
}

/** The answer for `key`: from memory, from a request already on its way, or from a new one made by `load`. */
export function cachedFetch<T>(
  audioId: string,
  key: string,
  load: (signal: AbortSignal) => Promise<{ data: T; size: number }>,
  signal?: AbortSignal,
): Promise<T> {
  let entry = entries.get(key)
  if (entry) {
    entries.delete(key)               // most recently used goes last
    entries.set(key, entry)
  } else {
    const ctrl = new AbortController()
    const created: Entry = { promise: Promise.resolve(), ctrl, waiters: 0, done: false, size: 0, audioId }
    created.promise = load(ctrl.signal).then(
      ({ data, size }) => {
        created.done = true
        created.size = size
        if (entries.get(key) === created) { bytes += size; evict() }
        return data
      },
      (err) => {
        if (entries.get(key) === created) entries.delete(key)       // a failure is never kept: the next try asks again
        throw err
      },
    )
    created.promise.catch(() => {})   // whoever waits handles it; this only keeps an unwatched failure quiet
    entries.set(key, created)
    entry = created
  }

  const shared = entry
  shared.waiters++
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const release = (): boolean => {
      if (settled) return false
      settled = true
      shared.waiters--
      signal?.removeEventListener('abort', onAbort)
      return true
    }
    const onAbort = () => {
      if (!release()) return
      if (shared.waiters === 0 && !shared.done) {             // nobody needs it: stop the request
        shared.ctrl.abort()
        if (entries.get(key) === shared) entries.delete(key)
      }
      reject(abortError())
    }
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener('abort', onAbort)
    shared.promise.then(
      (value) => { if (release()) resolve(value as T) },
      (err) => { if (release()) reject(err) },
    )
  })
}

/** Forget what was calculated for a file (its calibration changed, or it was removed). */
export function invalidateAudio(audioId: string): void {
  for (const [key, e] of entries) {
    if (e.audioId !== audioId) continue
    if (e.done) bytes -= e.size
    entries.delete(key)
  }
}

export function clearViewCache(): void {
  entries.forEach((e) => { if (!e.done) e.ctrl.abort() })
  entries.clear()
  bytes = 0
}

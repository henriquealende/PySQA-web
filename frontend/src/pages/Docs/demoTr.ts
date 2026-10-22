import { useLang } from '../../i18n'
import { TR_PP } from './trPP'
import { TR_DA } from './trDA'
import { TR_SA } from './trSA'

/** Portuguese → English texts of the documentation demos (chart titles, legends, buttons). */
const MAP: Record<string, string> = { ...TR_PP, ...TR_DA, ...TR_SA }

/** The text in the language of the interface; a text without translation stays as it is. */
export function tr(s: string): string {
  return useLang.getState().lang === 'en' ? (MAP[s] ?? s) : s
}

/** Copy of a Plotly figure (data/layout) with every known text translated. */
export function trDeep<T>(v: T): T {
  if (useLang.getState().lang !== 'en') return v
  const walk = (x: any): any => {
    if (typeof x === 'string') return MAP[x] ?? x
    if (Array.isArray(x)) return x.map(walk)
    if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
      const o: any = {}
      for (const k of Object.keys(x)) o[k] = walk(x[k])
      return o
    }
    return x
  }
  return walk(v)
}

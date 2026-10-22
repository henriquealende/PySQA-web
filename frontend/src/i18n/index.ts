/**
 * Interface language: Portuguese (the default) or English.
 *
 * Texts live in `locales/<lang>/<namespace>.ts`, one file per part of the app, each exporting a flat object
 * `{ 'namespace.key': 'text' }` (the files are picked up automatically). A text may contain `{name}` placeholders,
 * filled from the second argument of `t`.
 *
 *   const t = useT()                       // inside a component: re-renders when the language changes
 *   t('pp.import.title')
 *   t('batch.progress', { done: 2, total: 6 })
 *
 *   import { t } from '../i18n'            // outside React (stores, api, toasts): reads the current language
 */
import { useCallback } from 'react'
import { create } from 'zustand'

export type Lang = 'pt' | 'en'
type Dict = Record<string, string>

const load = (mods: Record<string, { default: Dict }>): Dict =>
  Object.values(mods).reduce<Dict>((all, m) => Object.assign(all, m.default), {})

const DICTS: Record<Lang, Dict> = {
  pt: load(import.meta.glob('./locales/pt/*.ts', { eager: true }) as Record<string, { default: Dict }>),
  en: load(import.meta.glob('./locales/en/*.ts', { eager: true }) as Record<string, { default: Dict }>),
}

const STORAGE_KEY = 'pysqa-lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'pt' || saved === 'en') return saved
  } catch { /* storage blocked: use the default */ }
  return 'pt'
}

interface LangState { lang: Lang; setLang: (l: Lang) => void }

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* not remembered */ }
    if (typeof document !== 'undefined') document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
    set({ lang })
  },
}))

if (typeof document !== 'undefined') document.documentElement.lang = useLang.getState().lang === 'pt' ? 'pt-BR' : 'en'

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const text = DICTS[lang][key] ?? DICTS[lang === 'pt' ? 'en' : 'pt'][key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}

/** For code outside components: uses the language chosen at this moment. */
export const t = (key: string, vars?: Record<string, string | number>) => translate(useLang.getState().lang, key, vars)

/** Inside components: the same, but the component draws again when the language changes. */
export function useT() {
  const lang = useLang((s) => s.lang)
  return useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
}

/** Locale for numbers and dates in the current language. */
export const useLocale = () => (useLang((s) => s.lang) === 'pt' ? 'pt-BR' : 'en-US')
export const currentLocale = () => (useLang.getState().lang === 'pt' ? 'pt-BR' : 'en-US')

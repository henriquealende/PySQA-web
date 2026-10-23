import { errorText } from './errors'
import { useLang } from '../i18n'

export interface BugReport {
  message: string
  contact?: string
  page?: string
  context?: string
  session_id?: string
  viewport?: string
}

/** Sends a bug report to the server, which stores it and forwards it to the maintainer. */
export async function sendBugReport(report: BugReport): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },     // X-Lang is added to every request in main.tsx
    body: JSON.stringify({ ...report, lang: useLang.getState().lang, user_agent: navigator.userAgent.slice(0, 300) }),
  })
  if (!res.ok) throw new Error(await errorText(res))
}

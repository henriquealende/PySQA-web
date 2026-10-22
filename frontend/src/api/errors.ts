import { t } from '../i18n'

export class SessionExpiredError extends Error {
  constructor() { super(t('cal.api.sessionExpired')) }
}

// FastAPI answers errors as {"detail": "..."}; show the sentence, not the JSON.
export async function errorText(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const body = JSON.parse(text)
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return body.detail.map((d: any) => d?.msg ?? String(d)).join('; ')
  } catch { /* not JSON */ }
  return text || t('cal.api.requestFailed', { status: res.status })
}

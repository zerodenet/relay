/**
 * Pull a subscription URL with sensible defaults & cache the raw body
 * so we can re-parse offline.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { paths } from '../storage/paths.js'

const DEFAULT_UA = 'ClashforWindows/0.20.39'

export interface SubscriptionUserInfo {
  upload?: number
  download?: number
  total?: number
  expire?: number
}

export interface FetchResult {
  body: string
  status: number
  headers: Record<string, string>
  user_info?: SubscriptionUserInfo
}

const parseSubscriptionUserInfo = (header: string | null): SubscriptionUserInfo | undefined => {
  if (!header) return undefined
  const out: SubscriptionUserInfo = {}
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=')
    if (!k || v == null) continue
    const num = Number(v)
    if (!Number.isFinite(num)) continue
    if (k === 'upload') out.upload = num
    else if (k === 'download') out.download = num
    else if (k === 'total') out.total = num
    else if (k === 'expire') out.expire = num
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export async function fetchSubscription(
  url: string,
  opts: { user_agent?: string; timeout_ms?: number } = {},
): Promise<FetchResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeout_ms ?? 30_000)
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': opts.user_agent ?? DEFAULT_UA,
        Accept: '*/*',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    })
    const body = await resp.text()
    const headers: Record<string, string> = {}
    resp.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))
    return {
      body,
      status: resp.status,
      headers,
      user_info: parseSubscriptionUserInfo(resp.headers.get('subscription-userinfo')),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function writeRawCache(subId: string, body: string): Promise<void> {
  await mkdir(paths.cacheSubs, { recursive: true })
  await writeFile(join(paths.cacheSubs, `${subId}.raw`), body, 'utf8')
}

export async function readRawCache(subId: string): Promise<string | undefined> {
  try {
    return await readFile(join(paths.cacheSubs, `${subId}.raw`), 'utf8')
  } catch {
    return undefined
  }
}

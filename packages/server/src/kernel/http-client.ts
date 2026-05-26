/**
 * HTTP client to Zero control-plane (fallback when IPC is unavailable).
 *
 * Endpoints assumed (as documented in zero/docs/control-plane-api/http-api.md):
 *   GET    /api/v1/<resource>
 *   POST   /api/v1/commands  { method, params }
 *   GET    /api/v1/events/stream?types=foo,bar  (SSE)
 */
import {
  type KernelClient,
  type KernelEvent,
  KernelUnreachableError,
  type QueryRequest,
  type CommandMethod,
} from './types.js'

export interface HttpClientOptions {
  base_url: string
  auth_token?: string
  timeout_ms?: number
}

export class HttpKernelClient implements KernelClient {
  private active = new Set<AbortController>()

  constructor(private readonly opts: HttpClientOptions) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' }
    if (this.opts.auth_token) h.Authorization = `Bearer ${this.opts.auth_token}`
    return h
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), this.opts.timeout_ms ?? 10000)
    try {
      const resp = await fetch(`${this.opts.base_url}${path}`, {
        method,
        headers: { ...this.headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`HTTP ${resp.status}: ${text}`)
      }
      return (await resp.json()) as T
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new KernelUnreachableError('http request timeout')
      }
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
        throw new KernelUnreachableError(e.message)
      }
      throw err
    } finally {
      clearTimeout(t)
    }
  }

  /** Map QueryRequest into HTTP path. */
  private queryPath(req: QueryRequest): string {
    if (typeof req === 'string') return `/api/v1/${req.toLowerCase()}`
    if ('Policy' in req) return `/api/v1/policies/${encodeURIComponent(req.Policy.policy_tag)}`
    if ('ActiveFlows' in req) {
      const limit = req.ActiveFlows.limit
      return `/api/v1/flows?limit=${limit}`
    }
    if ('Flow' in req) return `/api/v1/flows/${encodeURIComponent(req.Flow.flow_id)}`
    return '/api/v1/runtime'
  }

  query<T = unknown>(req: QueryRequest): Promise<T> {
    return this.request<T>('GET', this.queryPath(req))
  }

  command<T = unknown>(method: CommandMethod, params: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', '/api/v1/commands', { method, params })
  }

  async health(): Promise<{ ok: boolean; version?: string }> {
    try {
      const r = await this.request<{ version?: string }>('GET', '/api/v1/runtime')
      return { ok: true, version: r?.version }
    } catch {
      return { ok: false }
    }
  }

  async subscribe(
    events: string[],
    onEvent: (e: KernelEvent) => void,
  ): Promise<() => Promise<void>> {
    const controller = new AbortController()
    this.active.add(controller)
    const url = `${this.opts.base_url}/api/v1/events/stream?types=${encodeURIComponent(events.join(','))}`

    void (async () => {
      try {
        const resp = await fetch(url, { headers: this.headers(), signal: controller.signal })
        if (!resp.ok || !resp.body) throw new Error(`SSE ${resp.status}`)
        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
            if (!dataLine) continue
            try {
              const evt = JSON.parse(dataLine.slice(5).trim()) as KernelEvent
              onEvent(evt)
            } catch {
              // skip malformed
            }
          }
        }
      } catch {
        // stream ended / aborted
      } finally {
        this.active.delete(controller)
      }
    })()

    return async () => {
      controller.abort()
      this.active.delete(controller)
    }
  }

  async close(): Promise<void> {
    for (const c of this.active) c.abort()
    this.active.clear()
  }
}

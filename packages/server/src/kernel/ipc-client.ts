/**
 * IPC client over Unix Domain Socket / Windows Named Pipe.
 * Frame format: one JSON object per line, separated by \n.
 *
 * Concurrency model: a dedicated socket per outstanding request keeps the
 * implementation simple and avoids interleaving issues.
 * Subscription uses its own long-lived socket.
 */
import { Socket, createConnection } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  type KernelClient,
  type KernelEvent,
  KernelUnreachableError,
  type QueryRequest,
  type CommandMethod,
} from './types.js'

const expandTilde = (p: string): string => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

export interface IpcClientOptions {
  socket_path: string
  connect_timeout_ms?: number
  request_timeout_ms?: number
}

export class IpcKernelClient implements KernelClient {
  private subscriptions = new Set<Socket>()
  private readonly socketPath: string

  constructor(private readonly opts: IpcClientOptions) {
    this.socketPath = expandTilde(opts.socket_path)
  }

  private connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const sock = createConnection({ path: this.socketPath })
      const t = setTimeout(() => {
        sock.destroy()
        reject(new KernelUnreachableError(`ipc connect timeout: ${this.socketPath}`))
      }, this.opts.connect_timeout_ms ?? 3000)
      sock.once('connect', () => {
        clearTimeout(t)
        resolve(sock)
      })
      sock.once('error', (err) => {
        clearTimeout(t)
        reject(new KernelUnreachableError(err.message))
      })
    })
  }

  private async send<T>(payload: object): Promise<T> {
    const sock = await this.connect()
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sock.destroy()
        reject(new Error('ipc request timeout'))
      }, this.opts.request_timeout_ms ?? 10000)

      let buf = ''
      sock.setEncoding('utf8')
      sock.on('data', (chunk: string | Buffer) => {
        buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        const idx = buf.indexOf('\n')
        if (idx < 0) return
        const line = buf.slice(0, idx)
        clearTimeout(timeout)
        sock.end()
        try {
          const env = JSON.parse(line) as { ok: boolean; result?: T; error?: string }
          if (env.ok) resolve(env.result as T)
          else reject(new Error(env.error ?? 'kernel error'))
        } catch (err) {
          reject(err)
        }
      })
      sock.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
      sock.write(JSON.stringify(payload) + '\n')
    })
  }

  query<T = unknown>(request: QueryRequest): Promise<T> {
    return this.send<T>({ type: 'query', request })
  }

  command<T = unknown>(method: CommandMethod, params: Record<string, unknown>): Promise<T> {
    return this.send<T>({ type: 'command', method, params })
  }

  async health(): Promise<{ ok: boolean; version?: string }> {
    try {
      const r = await this.query<{ version?: string }>('Health')
      return { ok: true, version: r?.version }
    } catch {
      return { ok: false }
    }
  }

  async subscribe(
    events: string[],
    onEvent: (e: KernelEvent) => void,
  ): Promise<() => Promise<void>> {
    const sock = await this.connect()
    this.subscriptions.add(sock)
    sock.setEncoding('utf8')
    sock.write(JSON.stringify({ type: 'subscribe', events }) + '\n')

    let buf = ''
    sock.on('data', (chunk: string | Buffer) => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        if (!line) continue
        try {
          const obj = JSON.parse(line) as KernelEvent | { ok: boolean }
          if ('event_type' in obj) onEvent(obj)
        } catch {
          // ignore malformed line
        }
      }
    })
    sock.on('error', () => {
      this.subscriptions.delete(sock)
    })
    sock.on('close', () => {
      this.subscriptions.delete(sock)
    })

    return async () => {
      sock.end()
      this.subscriptions.delete(sock)
    }
  }

  async close(): Promise<void> {
    for (const s of this.subscriptions) s.destroy()
    this.subscriptions.clear()
  }
}

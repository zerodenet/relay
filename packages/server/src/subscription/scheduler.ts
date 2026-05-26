/**
 * Subscription synchronisation orchestrator.
 *
 * Responsibilities:
 *   - run a sync (fetch + parse + merge into nodes.json)
 *   - schedule periodic syncs based on each subscription's interval
 *   - keep node identity stable across re-syncs (fingerprint-based merge)
 */
import { ulid } from 'ulid'
import type { Node, NodeProtocol, Subscription, SubscriptionType } from '@zero-panel/shared'
import { nodeRepo, subscriptionRepo } from '../storage/repos.js'
import { emitLog } from '../events/bus.js'
import { fetchSubscription, writeRawCache, readRawCache } from './fetcher.js'
import { parseClash } from './parser-clash.js'
import { parseV2ray } from './parser-v2ray.js'
import { fingerprintOf, primaryAuthField, type ParsedNode } from './common.js'

const sniffType = (body: string): SubscriptionType => {
  if (/^\s*proxies\s*:/m.test(body) || /^\s*-\s+name\s*:/m.test(body)) return 'clash'
  if (body.trim().startsWith('{') && body.includes('outbounds')) return 'singbox'
  return 'v2ray'
}

const parseByType = (type: SubscriptionType, body: string): ParsedNode[] => {
  switch (type) {
    case 'clash':
      return parseClash(body)
    case 'v2ray':
      return parseV2ray(body)
    case 'singbox':
      // TODO: add a singbox parser; for now reuse v2ray fallback if URI-shaped lines exist.
      throw new Error('singbox parser not yet implemented')
  }
}

export interface SyncResult {
  sub_id: string
  ok: boolean
  error?: string
  parsed_count: number
  added: number
  updated: number
  removed: number
}

const toNodeRecord = (
  sub: Subscription,
  parsed: ParsedNode,
  existing?: Node,
): Node => {
  const protocol: NodeProtocol = parsed.protocol
  const fingerprint = fingerprintOf(protocol, parsed.server, parsed.port, primaryAuthField(parsed))

  const base: Node = {
    id: existing?.id ?? ulid(),
    sub_id: sub.id,
    fingerprint,
    raw: parsed.raw,
    name: parsed.name,
    region: parsed.region,
    protocol,
    server: parsed.server,
    port: parsed.port,
    params: parsed.params,
    alive: existing?.alive ?? false,
    latency_ms: existing?.latency_ms,
    last_probe_at: existing?.last_probe_at,
    banned_until: existing?.banned_until,
    manual_disabled: existing?.manual_disabled,
  }
  return base
}

export async function syncSubscription(sub: Subscription): Promise<SyncResult> {
  let body = ''
  let usedCache = false
  try {
    const fetched = await fetchSubscription(sub.url, { user_agent: sub.user_agent })
    if (fetched.status >= 200 && fetched.status < 300 && fetched.body) {
      body = fetched.body
      await writeRawCache(sub.id, body).catch(() => undefined)
    } else {
      throw new Error(`HTTP ${fetched.status}`)
    }
  } catch (err) {
    const cached = await readRawCache(sub.id)
    if (!cached) {
      const message = (err as Error).message
      await subscriptionRepo.update(sub.id, (cur) => ({
        ...cur,
        updated_at: Date.now(),
        last_sync_at: Date.now(),
        last_sync_ok: false,
        last_error: message,
      }))
      emitLog('warn', `subscription sync failed [${sub.name}]: ${message}`, 'subscription.scheduler')
      return { sub_id: sub.id, ok: false, error: message, parsed_count: 0, added: 0, updated: 0, removed: 0 }
    }
    body = cached
    usedCache = true
    emitLog('warn', `subscription [${sub.name}] using cached body`, 'subscription.scheduler')
  }

  const type = sub.type === 'singbox' ? sub.type : sniffType(body)
  let parsed: ParsedNode[]
  try {
    parsed = parseByType(type, body)
  } catch (err) {
    const message = (err as Error).message
    await subscriptionRepo.update(sub.id, (cur) => ({
      ...cur,
      updated_at: Date.now(),
      last_sync_at: Date.now(),
      last_sync_ok: false,
      last_error: message,
    }))
    emitLog('warn', `subscription parse failed [${sub.name}]: ${message}`, 'subscription.scheduler')
    return { sub_id: sub.id, ok: false, error: message, parsed_count: 0, added: 0, updated: 0, removed: 0 }
  }

  // Merge into nodes.json
  const all = await nodeRepo.list()
  const ownedExisting = all.filter((n) => n.sub_id === sub.id)
  const existingByFingerprint = new Map<string, Node>()
  for (const n of ownedExisting) existingByFingerprint.set(n.fingerprint, n)

  const merged: Node[] = all.filter((n) => n.sub_id !== sub.id)
  const seen = new Set<string>()
  let added = 0
  let updated = 0
  for (const p of parsed) {
    const fp = fingerprintOf(p.protocol, p.server, p.port, primaryAuthField(p))
    if (seen.has(fp)) continue
    seen.add(fp)
    const ex = existingByFingerprint.get(fp)
    if (ex) updated++
    else added++
    merged.push(toNodeRecord(sub, p, ex))
  }
  const removed = ownedExisting.length - (added > 0 || updated > 0 ? updated : 0) - added
  // simpler: removed = ownedExisting that are not seen
  const removedCount = ownedExisting.filter((n) => !seen.has(n.fingerprint)).length

  await nodeRepo.replaceAll(merged)
  await subscriptionRepo.update(sub.id, (cur) => ({
    ...cur,
    updated_at: Date.now(),
    last_sync_at: Date.now(),
    last_sync_ok: true,
    last_error: undefined,
    node_count: parsed.length,
  }))

  emitLog(
    'info',
    `synced [${sub.name}] parsed=${parsed.length} added=${added} updated=${updated} removed=${removedCount}${usedCache ? ' (cached)' : ''}`,
    'subscription.scheduler',
  )
  return {
    sub_id: sub.id,
    ok: true,
    parsed_count: parsed.length,
    added,
    updated,
    removed: removedCount,
  }
}

/**
 * Periodic scheduler. Each subscription is checked every minute; if its
 * last_sync_at is older than its interval (with ±10% jitter), trigger a sync.
 */
export class SubscriptionScheduler {
  private timer?: NodeJS.Timeout
  private inflight = new Set<string>()

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick().catch((err) => {
        emitLog('warn', `scheduler tick failed: ${(err as Error).message}`, 'subscription.scheduler')
      })
    }, 60_000)
    // Run an initial pass shortly after boot.
    setTimeout(() => void this.tick(), 5_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private jitter(seconds: number): number {
    const f = 0.9 + Math.random() * 0.2
    return seconds * f
  }

  private async tick(): Promise<void> {
    const subs = await subscriptionRepo.list()
    const now = Date.now()
    for (const sub of subs) {
      if (!sub.enabled) continue
      if (this.inflight.has(sub.id)) continue
      const interval = this.jitter(sub.interval_seconds) * 1000
      const due = !sub.last_sync_at || now - sub.last_sync_at >= interval
      if (!due) continue
      this.inflight.add(sub.id)
      void syncSubscription(sub).finally(() => this.inflight.delete(sub.id))
    }
  }

  async runOnce(subId: string): Promise<SyncResult> {
    const sub = await subscriptionRepo.require(subId)
    if (this.inflight.has(sub.id)) {
      return { sub_id: sub.id, ok: false, error: 'sync already in progress', parsed_count: 0, added: 0, updated: 0, removed: 0 }
    }
    this.inflight.add(sub.id)
    try {
      return await syncSubscription(sub)
    } finally {
      this.inflight.delete(sub.id)
    }
  }
}

let scheduler: SubscriptionScheduler | null = null
export const initScheduler = (): SubscriptionScheduler => {
  scheduler = new SubscriptionScheduler()
  return scheduler
}
export const getScheduler = (): SubscriptionScheduler => {
  if (!scheduler) throw new Error('scheduler not initialised')
  return scheduler
}

/**
 * Clash / Clash Meta YAML subscription parser.
 *
 * The reference shape:
 *   proxies:
 *     - name: "🇭🇰 HK 01"
 *       type: vless | vmess | trojan | ss | hysteria2 | tuic | socks5 | http
 *       server: ...
 *       port: ...
 *       (protocol-specific fields)
 *
 * We map clash protocol identifiers to our NodeProtocol enum.
 */
import { parse as parseYaml } from 'yaml'
import type { NodeProtocol } from '@zero-panel/shared'
import { type ParsedNode, SubscriptionParseError } from './common.js'
import { detectRegion } from './regions.js'

interface ClashProxy {
  name: string
  type: string
  server: string
  port: number
  [key: string]: unknown
}

const PROTOCOL_MAP: Record<string, NodeProtocol> = {
  vless: 'vless',
  vmess: 'vmess',
  trojan: 'trojan',
  ss: 'shadowsocks',
  shadowsocks: 'shadowsocks',
  hysteria2: 'hysteria2',
  hy2: 'hysteria2',
  tuic: 'tuic',
  socks5: 'socks',
  socks: 'socks',
  http: 'http',
}

/** Pull through everything except the canonical fields, so dialects can read them later. */
const passthroughParams = (proxy: ClashProxy): Record<string, unknown> => {
  const reserved = new Set(['name', 'type', 'server', 'port'])
  const params: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(proxy)) {
    if (!reserved.has(k)) params[k] = v
  }
  return params
}

const normaliseShadowsocks = (proxy: ClashProxy): Record<string, unknown> => {
  const p = passthroughParams(proxy)
  // Clash uses `cipher`; some forks use `method`. Unify to both for downstream tolerance.
  if (p.cipher && !p.method) p.method = p.cipher
  if (p.method && !p.cipher) p.cipher = p.method
  return p
}

export function parseClash(raw: string): ParsedNode[] {
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch (err) {
    throw new SubscriptionParseError(`invalid YAML: ${(err as Error).message}`)
  }
  if (!doc || typeof doc !== 'object') {
    throw new SubscriptionParseError('YAML root is not an object')
  }
  const proxies = (doc as { proxies?: unknown }).proxies
  if (!Array.isArray(proxies)) {
    throw new SubscriptionParseError('missing top-level `proxies` array')
  }

  const out: ParsedNode[] = []
  for (const raw of proxies) {
    if (!raw || typeof raw !== 'object') continue
    const proxy = raw as ClashProxy
    if (!proxy.name || !proxy.type || !proxy.server || !proxy.port) continue
    const protocol = PROTOCOL_MAP[String(proxy.type).toLowerCase()]
    if (!protocol) continue

    const params =
      protocol === 'shadowsocks' ? normaliseShadowsocks(proxy) : passthroughParams(proxy)

    out.push({
      raw: JSON.stringify(proxy),
      name: proxy.name,
      region: detectRegion(proxy.name),
      protocol,
      server: proxy.server,
      port: Number(proxy.port),
      params,
    })
  }
  return out
}

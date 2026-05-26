/**
 * Parse V2Ray-style subscriptions:
 *   - text body where each line is a single share URI
 *   - or base64-encoded version of the above
 *
 * Supported URI schemes:
 *   vless://uuid@host:port?...#name
 *   trojan://password@host:port?...#name
 *   ss://base64(method:password)@host:port#name  (or method:password@host:port)
 *   ss://base64(method:password@host:port)#name  (legacy)
 *   vmess://base64({...json...})
 *   hysteria2://password@host:port?...#name
 *   tuic://uuid:password@host:port?...#name
 */
import type { NodeProtocol } from '@zero-panel/shared'
import { type ParsedNode, SubscriptionParseError } from './common.js'
import { detectRegion } from './regions.js'

const tryDecodeBase64 = (s: string): string => {
  const t = s.trim().replace(/-/g, '+').replace(/_/g, '/')
  try {
    const buf = Buffer.from(t, 'base64')
    const decoded = buf.toString('utf8')
    if (decoded.includes('://')) return decoded
  } catch {
    // ignore
  }
  return s
}

const queryToObject = (search: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const [k, v] of sp.entries()) out[k] = v
  return out
}

const safeName = (uri: URL, fallback: string): string => {
  if (uri.hash) return decodeURIComponent(uri.hash.slice(1))
  return fallback
}

const parseVless = (uri: URL): ParsedNode => {
  const uuid = decodeURIComponent(uri.username)
  const server = uri.hostname
  const port = Number(uri.port)
  const params = queryToObject(uri.search)
  return {
    raw: uri.href,
    name: safeName(uri, `${server}:${port}`),
    region: detectRegion(safeName(uri, server)),
    protocol: 'vless',
    server,
    port,
    params: { uuid, ...params },
  }
}

const parseTrojan = (uri: URL): ParsedNode => {
  const password = decodeURIComponent(uri.username)
  const server = uri.hostname
  const port = Number(uri.port)
  return {
    raw: uri.href,
    name: safeName(uri, `${server}:${port}`),
    region: detectRegion(safeName(uri, server)),
    protocol: 'trojan',
    server,
    port,
    params: { password, ...queryToObject(uri.search) },
  }
}

const parseHysteria2 = (uri: URL): ParsedNode => {
  const password = decodeURIComponent(uri.username || uri.password || '')
  const server = uri.hostname
  const port = Number(uri.port)
  return {
    raw: uri.href,
    name: safeName(uri, `${server}:${port}`),
    region: detectRegion(safeName(uri, server)),
    protocol: 'hysteria2',
    server,
    port,
    params: { password, ...queryToObject(uri.search) },
  }
}

const parseTuic = (uri: URL): ParsedNode => {
  const userInfo = `${uri.username}${uri.password ? ':' + uri.password : ''}`
  const [uuid, password] = decodeURIComponent(userInfo).split(':')
  const server = uri.hostname
  const port = Number(uri.port)
  return {
    raw: uri.href,
    name: safeName(uri, `${server}:${port}`),
    region: detectRegion(safeName(uri, server)),
    protocol: 'tuic',
    server,
    port,
    params: { uuid, password, ...queryToObject(uri.search) },
  }
}

const parseSs = (uriString: string): ParsedNode | undefined => {
  // ss://[base64(method:password)]@host:port#name
  // or ss://base64(method:password@host:port)#name (legacy)
  const hashIdx = uriString.indexOf('#')
  const namePart = hashIdx >= 0 ? decodeURIComponent(uriString.slice(hashIdx + 1)) : ''
  const head = (hashIdx >= 0 ? uriString.slice(0, hashIdx) : uriString).slice(5) // strip 'ss://'

  let method = ''
  let password = ''
  let server = ''
  let port = 0

  const at = head.indexOf('@')
  if (at >= 0) {
    const left = head.slice(0, at)
    const right = head.slice(at + 1)
    const decoded = tryDecodeBase64(left)
    const m = decoded.match(/^([^:]+):(.*)$/)
    if (!m) return undefined
    method = m[1]!
    password = m[2]!
    const [h, p] = right.split(':')
    server = h ?? ''
    port = Number(p ?? 0)
  } else {
    const decoded = tryDecodeBase64(head)
    const m = decoded.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/)
    if (!m) return undefined
    method = m[1]!
    password = m[2]!
    server = m[3]!
    port = Number(m[4]!)
  }

  return {
    raw: uriString,
    name: namePart || `${server}:${port}`,
    region: detectRegion(namePart || server),
    protocol: 'shadowsocks',
    server,
    port,
    params: { cipher: method, method, password },
  }
}

const parseVmess = (uriString: string): ParsedNode | undefined => {
  const payload = uriString.slice(8)
  let json: Record<string, unknown>
  try {
    json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch {
    return undefined
  }
  const server = String(json.add ?? '')
  const port = Number(json.port ?? 0)
  const name = String(json.ps ?? json.name ?? `${server}:${port}`)
  if (!server || !port) return undefined
  return {
    raw: uriString,
    name,
    region: detectRegion(name),
    protocol: 'vmess',
    server,
    port,
    params: {
      uuid: String(json.id ?? ''),
      alterId: Number(json.aid ?? 0),
      cipher: String(json.scy ?? json.security ?? 'auto'),
      network: String(json.net ?? 'tcp'),
      type: String(json.type ?? ''),
      host: String(json.host ?? ''),
      path: String(json.path ?? ''),
      tls: String(json.tls ?? ''),
      sni: String(json.sni ?? ''),
    },
  }
}

const PROTO_PARSERS: Record<string, (input: string) => ParsedNode | undefined> = {
  'vless:': (s) => parseVless(new URL(s)),
  'trojan:': (s) => parseTrojan(new URL(s)),
  'hysteria2:': (s) => parseHysteria2(new URL(s)),
  'hy2:': (s) => parseHysteria2(new URL(s.replace(/^hy2:/, 'hysteria2:'))),
  'tuic:': (s) => parseTuic(new URL(s)),
  'ss:': (s) => parseSs(s),
  'vmess:': (s) => parseVmess(s),
}

const ALL_PROTOCOLS: NodeProtocol[] = [
  'vless',
  'vmess',
  'trojan',
  'shadowsocks',
  'hysteria2',
  'tuic',
  'socks',
  'http',
]
void ALL_PROTOCOLS // keep referenced for tooling

export function parseV2ray(raw: string): ParsedNode[] {
  let body = raw.trim()
  if (!body.includes('://')) body = tryDecodeBase64(body)

  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out: ParsedNode[] = []
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const scheme = line.slice(0, colon + 1).toLowerCase()
    const parser = PROTO_PARSERS[scheme]
    if (!parser) continue
    try {
      const node = parser(line)
      if (node) out.push(node)
    } catch {
      // ignore malformed line
    }
  }
  if (out.length === 0) {
    throw new SubscriptionParseError('no valid URIs detected')
  }
  return out
}

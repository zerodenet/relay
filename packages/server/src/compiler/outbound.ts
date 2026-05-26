/**
 * Convert a panel Node into a Zero outbound.
 *
 * Protocol-specific fields are read from `node.params` which was
 * populated by the subscription parser. We try to be tolerant:
 * missing optional fields are simply omitted.
 */
import type { Node } from '@zero-panel/shared'
import type {
  ZeroOutbound,
  ZeroVlessOutbound,
  ZeroVmessOutbound,
  ZeroTrojanOutbound,
  ZeroShadowsocksOutbound,
  ZeroHysteria2Outbound,
  ZeroTuicOutbound,
  ZeroSocksOutbound,
  ZeroHttpOutbound,
  ZeroTlsConfig,
  ZeroTransportConfig,
} from './types.js'

export const nodeTag = (id: string): string => `node-${id.slice(0, 8)}`

const p = (node: Node, key: string): unknown => node.params[key]

const str = (node: Node, key: string, fallback = ''): string => String(p(node, key) ?? fallback)

const buildTls = (node: Node): ZeroTlsConfig | undefined => {
  const tls = p(node, 'tls')
  const sni = str(node, 'sni') || str(node, 'server_name')
  const skipCert = p(node, 'skip-cert-verify') ?? p(node, 'allowInsecure')
  const reality = p(node, 'reality')

  const hasTls = tls === true || tls === 'true' || sni || reality
  if (!hasTls) return undefined

  const cfg: ZeroTlsConfig = {
    enabled: true,
    server_name: sni || node.server,
    insecure: skipCert === true || skipCert === 'true',
  }

  if (reality && typeof reality === 'object') {
    cfg.reality = {
      enabled: true,
      public_key: String((reality as any).public_key ?? ''),
      short_id: String((reality as any).short_id ?? ''),
    }
  }
  return cfg
}

const buildTransport = (node: Node): ZeroTransportConfig | undefined => {
  const network = str(node, 'network') || str(node, 'transport') || 'tcp'
  if (network === 'tcp') return undefined

  const t: ZeroTransportConfig = { type: network as ZeroTransportConfig['type'] }
  const path = str(node, 'path')
  const host = str(node, 'host')
  const serviceName = str(node, 'service_name')

  if (path) t.path = path
  if (host) t.headers = { Host: host }
  if (serviceName) t.service_name = serviceName
  return t
}

export function nodeToOutbound(node: Node): ZeroOutbound {
  const tag = nodeTag(node.id)
  const base = { tag, server: node.server, server_port: node.port }

  switch (node.protocol) {
    case 'vless':
      return {
        ...base,
        type: 'vless',
        uuid: str(node, 'uuid'),
        flow: str(node, 'flow') || undefined,
        tls: buildTls(node),
        transport: buildTransport(node),
      } as ZeroVlessOutbound

    case 'vmess':
      return {
        ...base,
        type: 'vmess',
        uuid: str(node, 'uuid'),
        security: str(node, 'cipher') || str(node, 'security') || 'auto',
        alter_id: Number(p(node, 'alterId') ?? p(node, 'alter_id') ?? 0) || undefined,
        tls: buildTls(node),
        transport: buildTransport(node),
      } as ZeroVmessOutbound

    case 'trojan':
      return {
        ...base,
        type: 'trojan',
        password: str(node, 'password'),
        tls: buildTls(node) ?? { enabled: true, server_name: node.server },
        transport: buildTransport(node),
      } as ZeroTrojanOutbound

    case 'shadowsocks':
      return {
        ...base,
        type: 'shadowsocks',
        method: str(node, 'cipher') || str(node, 'method'),
        password: str(node, 'password'),
      } as ZeroShadowsocksOutbound

    case 'hysteria2':
      return {
        ...base,
        type: 'hysteria2',
        password: str(node, 'password'),
        tls: buildTls(node) ?? { enabled: true, server_name: node.server, insecure: false },
      } as ZeroHysteria2Outbound

    case 'tuic':
      return {
        ...base,
        type: 'tuic',
        uuid: str(node, 'uuid'),
        password: str(node, 'password'),
        tls: buildTls(node) ?? { enabled: true, server_name: node.server, insecure: false },
      } as ZeroTuicOutbound

    case 'socks':
      return {
        ...base,
        type: 'socks',
        username: str(node, 'username') || undefined,
        password: str(node, 'password') || undefined,
      } as ZeroSocksOutbound

    case 'http':
      return {
        ...base,
        type: 'http',
        username: str(node, 'username') || undefined,
        password: str(node, 'password') || undefined,
      } as ZeroHttpOutbound
  }
}

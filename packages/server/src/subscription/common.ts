/**
 * Common types & helpers shared by subscription parsers.
 */
import { createHash } from 'node:crypto'
import type { Node, NodeProtocol } from '@zero-panel/shared'

export type ParsedNode = Omit<Node, 'id' | 'sub_id' | 'fingerprint' | 'alive'> & {
  alive?: boolean
}

export const fingerprintOf = (
  protocol: NodeProtocol,
  server: string,
  port: number,
  authField: string,
): string =>
  createHash('sha1')
    .update([protocol, server, port, authField].join('|'))
    .digest('hex')
    .slice(0, 32)

export const primaryAuthField = (n: ParsedNode): string => {
  switch (n.protocol) {
    case 'vless':
    case 'vmess':
    case 'tuic':
      return String(n.params.uuid ?? '')
    case 'trojan':
    case 'hysteria2':
      return String(n.params.password ?? '')
    case 'shadowsocks':
      return `${String(n.params.cipher ?? '')}:${String(n.params.password ?? '')}`
    case 'socks':
    case 'http':
      return `${String(n.params.username ?? '')}:${String(n.params.password ?? '')}`
  }
}

export class SubscriptionParseError extends Error {
  code = 'SUBSCRIPTION_PARSE_ERROR' as const
}

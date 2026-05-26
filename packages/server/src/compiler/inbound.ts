/**
 * Convert a panel Forward into a Zero inbound.
 *
 * Currently only mixed/socks/http without auth (L4-ish entry).
 */
import type { Forward } from '@zero-panel/shared'
import type { ZeroInbound } from './types.js'

export const forwardTag = (id: string): string => `fwd-${id.slice(0, 8)}`

export function forwardToInbound(fwd: Forward): ZeroInbound {
  const tag = forwardTag(fwd.id)
  const base = { tag, listen: fwd.listen, listen_port: fwd.port }

  switch (fwd.listen_protocol) {
    case 'mixed':
      return { type: 'mixed', ...base }
    case 'socks':
      return { type: 'socks', ...base }
    case 'http':
      return { type: 'http', ...base }
  }
}

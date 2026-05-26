/**
 * Convert panel model into Zero route rules.
 *
 * Each enabled Forward → one rule: inbound tag → chain outbound tag.
 * Fallback rule: final = "block" (reject unmatched traffic).
 */
import type { Forward } from '@zero-panel/shared'
import type { ZeroRouteRule } from './types.js'
import { forwardTag } from './inbound.js'

export const chainTag = (forwardId: string): string => `chain-${forwardId.slice(0, 8)}`

export function buildRouteRules(forwards: Forward[]): ZeroRouteRule[] {
  return forwards
    .filter((f) => f.enabled)
    .map((fwd) => ({
      inbound: [forwardTag(fwd.id)],
      outbound: chainTag(fwd.id),
    }))
}

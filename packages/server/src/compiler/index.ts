/**
 * Configuration compiler: panel model → Zero config.json
 *
 * Pipeline:
 *   1. Collect all nodes → protocol outbounds
 *   2. Collect all tunnels → group outbounds (selector/urltest/fallback/chained)
 *   3. For each forward:
 *      a. Create a `chained` outbound that strings together the tunnel_chain
 *      b. Create a mixed/socks/http inbound
 *      c. Create a route rule: inbound → chained outbound
 *   4. Assemble ZeroConfig
 *   5. Validate (warnings / errors)
 */
import type { Node, Tunnel, Forward, TunnelMember } from '@zero-panel/shared'
import type {
  ZeroConfig,
  ZeroOutbound,
  ZeroSelectorOutbound,
  ZeroUrltestOutbound,
  ZeroFallbackOutbound,
  ZeroChainedOutbound,
} from './types.js'
import { nodeToOutbound, nodeTag } from './outbound.js'
import { forwardToInbound, forwardTag } from './inbound.js'
import { buildRouteRules, chainTag } from './route.js'

export interface CompilerResult {
  config: ZeroConfig
  warnings: string[]
  errors: string[]
}

const tunnelTag = (id: string): string => `tn-${id.slice(0, 8)}`

/**
 * Resolve a tunnel's members into a flat list of outbound tags.
 * Handles nested tunnels recursively.
 */
function resolveMemberTags(
  tunnel: Tunnel,
  tunnelMap: Map<string, Tunnel>,
  visited: Set<string>,
): string[] {
  if (visited.has(tunnel.id)) return [] // cycle guard
  visited.add(tunnel.id)

  const tags: string[] = []
  for (const m of tunnel.members) {
    if (m.kind === 'node') {
      tags.push(nodeTag(m.node_id))
    } else {
      const child = tunnelMap.get(m.tunnel_id)
      if (child) {
        // For nested tunnels referenced as a member, we use the
        // child's group tag (not flatten).
        tags.push(tunnelTag(child.id))
      }
    }
  }
  return tags
}

function tunnelToGroupOutbound(
  tunnel: Tunnel,
  tunnelMap: Map<string, Tunnel>,
): ZeroOutbound {
  const tag = tunnelTag(tunnel.id)
  const memberTags = resolveMemberTags(tunnel, tunnelMap, new Set())

  // Fallback: if no members, insert a direct outbound to avoid empty group.
  if (memberTags.length === 0) {
    return { type: 'selector', tag, outbounds: ['direct'] }
  }

  switch (tunnel.type) {
    case 'selector':
      return {
        type: 'selector',
        tag,
        outbounds: memberTags,
        default: memberTags[0],
      } as ZeroSelectorOutbound

    case 'urltest':
      return {
        type: 'urltest',
        tag,
        outbounds: memberTags,
        url: tunnel.policy.test_url || 'http://www.gstatic.com/generate_204',
        interval: `${tunnel.policy.test_interval_seconds ?? 300}s`,
      } as ZeroUrltestOutbound

    case 'fallback':
      return {
        type: 'fallback',
        tag,
        outbounds: memberTags,
      } as ZeroFallbackOutbound

    case 'round_robin':
      // Zero has no native round_robin; use selector + panel-side rotation.
      return {
        type: 'selector',
        tag,
        outbounds: memberTags,
        default: memberTags[0],
      } as ZeroSelectorOutbound

    case 'chain':
      return {
        type: 'chained',
        tag,
        outbounds: memberTags,
      } as ZeroChainedOutbound
  }
}

export function build(
  nodes: Node[],
  tunnels: Tunnel[],
  forwards: Forward[],
  opts?: { controlListen?: { address: string; port: number } },
): CompilerResult {
  const warnings: string[] = []
  const errors: string[] = []

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const tunnelMap = new Map(tunnels.map((t) => [t.id, t]))

  // ─── Outbounds ────────────────────────────────────

  // 1. Node outbounds
  const nodeOutbounds: ZeroOutbound[] = []
  for (const node of nodes) {
    if (node.manual_disabled) continue
    if (node.banned_until && node.banned_until > Date.now()) {
      warnings.push(`node "${node.name}" is temporarily banned, skipped`)
      continue
    }
    nodeOutbounds.push(nodeToOutbound(node))
  }

  // 2. Tunnel group outbounds
  const tunnelOutbounds: ZeroOutbound[] = []
  for (const tunnel of tunnels) {
    tunnelOutbounds.push(tunnelToGroupOutbound(tunnel, tunnelMap))
  }

  // 3. Chain outbounds (one per forward)
  const chainOutbounds: ZeroOutbound[] = []
  for (const fwd of forwards) {
    if (!fwd.enabled) continue
    const chain: string[] = []
    for (const tid of fwd.tunnel_chain) {
      const tn = tunnelMap.get(tid)
      if (tn) {
        chain.push(tunnelTag(tn.id))
      } else {
        warnings.push(`forward "${fwd.name}": tunnel ${tid} not found, skipped`)
      }
    }
    if (chain.length === 0) {
      errors.push(`forward "${fwd.name}": empty tunnel chain after resolution`)
      continue
    }
    chainOutbounds.push({
      type: 'chained',
      tag: chainTag(fwd.id),
      outbounds: chain,
    } as ZeroChainedOutbound)
  }

  // ─── Inbounds ─────────────────────────────────────

  const inbounds = forwards
    .filter((f) => f.enabled)
    .map((fwd) => forwardToInbound(fwd))

  // ─── Route ────────────────────────────────────────

  const rules = buildRouteRules(forwards.filter((f) => f.enabled))

  // ─── Assemble ─────────────────────────────────────

  const config: ZeroConfig = {
    log: { level: 'info' },
    api: opts?.controlListen
      ? { control: { enabled: true, listen: opts.controlListen } }
      : undefined,
    inbounds,
    outbounds: [
      { type: 'direct', tag: 'direct' } as ZeroOutbound,
      { type: 'block', tag: 'block' } as ZeroOutbound,
      ...nodeOutbounds,
      ...tunnelOutbounds,
      ...chainOutbounds,
    ],
    route: {
      rules,
      final: 'block',
    },
  }

  return { config, warnings, errors }
}

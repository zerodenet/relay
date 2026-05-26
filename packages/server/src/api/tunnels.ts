import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  tunnelMemberSchema,
  tunnelPolicySchema,
  tunnelRegionFilterSchema,
  tunnelTypeSchema,
  type Tunnel,
  type TunnelMember,
} from '@zero-panel/shared'
import { forwardRepo, nodeRepo, tunnelRepo } from '../storage/repos.js'
import { ApiError } from './errors.js'
import { newId, nowMs, ok } from './helpers.js'

const createBody = z.object({
  name: z.string().min(1).max(64),
  type: tunnelTypeSchema,
  members: z.array(tunnelMemberSchema).default([]),
  policy: tunnelPolicySchema.default({}),
  region_filter: tunnelRegionFilterSchema.optional(),
})

const patchBody = createBody.partial()

const detectCycle = async (rootId: string, members: TunnelMember[]): Promise<boolean> => {
  const tunnels = await tunnelRepo.list()
  const map = new Map(tunnels.map((t) => [t.id, t]))
  const stack: string[] = []
  const visit = (id: string, currentMembers: TunnelMember[]): boolean => {
    if (stack.includes(id)) return true
    stack.push(id)
    for (const m of currentMembers) {
      if (m.kind !== 'tunnel') continue
      if (m.tunnel_id === rootId) return true
      const child = map.get(m.tunnel_id)
      if (child && visit(child.id, child.members)) return true
    }
    stack.pop()
    return false
  }
  return visit(rootId, members)
}

const validateMembers = async (members: TunnelMember[]): Promise<void> => {
  const nodeIds = new Set((await nodeRepo.list()).map((n) => n.id))
  const tunnelIds = new Set((await tunnelRepo.list()).map((t) => t.id))
  for (const m of members) {
    if (m.kind === 'node' && !nodeIds.has(m.node_id))
      throw new ApiError(400, 'BAD_REFERENCE', `node not found: ${m.node_id}`)
    if (m.kind === 'tunnel' && !tunnelIds.has(m.tunnel_id))
      throw new ApiError(400, 'BAD_REFERENCE', `tunnel not found: ${m.tunnel_id}`)
  }
}

export const registerTunnelRoutes = async (app: FastifyInstance): Promise<void> => {
  const guard = { onRequest: [app.authenticate] }

  app.get('/api/tunnels', guard, async (_req, reply) => ok(reply, { items: await tunnelRepo.list() }))

  app.post('/api/tunnels', guard, async (req, reply) => {
    const body = createBody.parse(req.body)
    await validateMembers(body.members)
    const now = nowMs()
    const item: Tunnel = {
      id: newId(),
      name: body.name,
      type: body.type,
      members: body.members,
      policy: body.policy,
      region_filter: body.region_filter,
      created_at: now,
      updated_at: now,
    }
    await tunnelRepo.create(item)
    return ok(reply, item, 201)
  })

  app.get<{ Params: { id: string } }>('/api/tunnels/:id', guard, async (req, reply) =>
    ok(reply, await tunnelRepo.require(req.params.id)),
  )

  app.patch<{ Params: { id: string } }>('/api/tunnels/:id', guard, async (req, reply) => {
    const patch = patchBody.parse(req.body)
    if (patch.members) {
      await validateMembers(patch.members)
      if (await detectCycle(req.params.id, patch.members)) {
        throw new ApiError(400, 'CYCLE_DETECTED', 'tunnel members would form a cycle')
      }
    }
    const updated = await tunnelRepo.update(req.params.id, (cur) => ({
      ...cur,
      ...patch,
      members: patch.members ?? cur.members,
      policy: patch.policy ?? cur.policy,
      updated_at: nowMs(),
    }))
    return ok(reply, updated)
  })

  app.delete<{ Params: { id: string } }>('/api/tunnels/:id', guard, async (req, reply) => {
    const refs = (await forwardRepo.list()).some((f) => f.tunnel_chain.includes(req.params.id))
    if (refs) throw new ApiError(409, 'IN_USE', 'tunnel is referenced by a forward rule')
    await tunnelRepo.remove(req.params.id)
    return ok(reply, { removed: true })
  })

  app.get<{ Params: { id: string } }>('/api/tunnels/:id/members', guard, async (req, reply) => {
    const tunnel = await tunnelRepo.require(req.params.id)
    const nodeMap = new Map((await nodeRepo.list()).map((n) => [n.id, n]))
    const tunnelMap = new Map((await tunnelRepo.list()).map((t) => [t.id, t]))

    const seen = new Set<string>()
    const out: { kind: 'node'; node: unknown }[] = []
    const expand = (members: TunnelMember[]) => {
      for (const m of members) {
        if (m.kind === 'node') {
          if (seen.has(m.node_id)) continue
          seen.add(m.node_id)
          const n = nodeMap.get(m.node_id)
          if (n) out.push({ kind: 'node', node: n })
        } else {
          const child = tunnelMap.get(m.tunnel_id)
          if (child) expand(child.members)
        }
      }
    }
    expand(tunnel.members)
    return ok(reply, { items: out })
  })
}

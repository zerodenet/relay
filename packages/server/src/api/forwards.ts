import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  forwardDestinationSchema,
  forwardListenProtocolSchema,
  type Forward,
} from '@zero-panel/shared'
import { forwardRepo, tunnelRepo } from '../storage/repos.js'
import { ApiError } from './errors.js'
import { newId, nowMs, ok } from './helpers.js'

const createBody = z.object({
  name: z.string().min(1).max(64),
  listen: z.string().default('0.0.0.0'),
  port: z.number().int().min(1).max(65535),
  listen_protocol: forwardListenProtocolSchema.default('mixed'),
  destination: forwardDestinationSchema.optional(),
  tunnel_chain: z.array(z.string()).min(1),
  enabled: z.boolean().default(true),
})

const patchBody = createBody.partial()

const ensureUniquePort = async (
  listen: string,
  port: number,
  exclude?: string,
): Promise<void> => {
  const items = await forwardRepo.list()
  if (
    items.some(
      (f) => f.listen === listen && f.port === port && f.enabled && f.id !== exclude,
    )
  ) {
    throw new ApiError(409, 'PORT_IN_USE', `port ${listen}:${port} is already in use`)
  }
}

const validateChain = async (chain: string[]): Promise<void> => {
  const ids = new Set((await tunnelRepo.list()).map((t) => t.id))
  for (const tid of chain) {
    if (!ids.has(tid)) throw new ApiError(400, 'BAD_REFERENCE', `tunnel not found: ${tid}`)
  }
}

export const registerForwardRoutes = async (app: FastifyInstance): Promise<void> => {
  const guard = { onRequest: [app.authenticate] }

  app.get('/api/forwards', guard, async (_req, reply) =>
    ok(reply, { items: await forwardRepo.list() }),
  )

  app.post('/api/forwards', guard, async (req, reply) => {
    const body = createBody.parse(req.body)
    await ensureUniquePort(body.listen, body.port)
    await validateChain(body.tunnel_chain)
    const now = nowMs()
    const item: Forward = {
      id: newId(),
      name: body.name,
      listen: body.listen,
      port: body.port,
      listen_protocol: body.listen_protocol,
      destination: body.destination,
      tunnel_chain: body.tunnel_chain,
      enabled: body.enabled,
      created_at: now,
      updated_at: now,
    }
    await forwardRepo.create(item)
    return ok(reply, item, 201)
  })

  app.get<{ Params: { id: string } }>('/api/forwards/:id', guard, async (req, reply) =>
    ok(reply, await forwardRepo.require(req.params.id)),
  )

  app.patch<{ Params: { id: string } }>('/api/forwards/:id', guard, async (req, reply) => {
    const patch = patchBody.parse(req.body)
    const cur = await forwardRepo.require(req.params.id)
    if (patch.tunnel_chain) await validateChain(patch.tunnel_chain)
    if (patch.port || patch.listen) {
      await ensureUniquePort(
        patch.listen ?? cur.listen,
        patch.port ?? cur.port,
        cur.id,
      )
    }
    const updated = await forwardRepo.update(req.params.id, (it) => ({
      ...it,
      ...patch,
      updated_at: nowMs(),
    }))
    return ok(reply, updated)
  })

  app.delete<{ Params: { id: string } }>('/api/forwards/:id', guard, async (req, reply) => {
    await forwardRepo.remove(req.params.id)
    return ok(reply, { removed: true })
  })

  app.post<{ Params: { id: string } }>('/api/forwards/:id/toggle', guard, async (req, reply) => {
    const updated = await forwardRepo.update(req.params.id, (it) => ({
      ...it,
      enabled: !it.enabled,
      updated_at: nowMs(),
    }))
    return ok(reply, updated)
  })
}

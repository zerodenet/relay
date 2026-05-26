import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { nodeProtocolSchema } from '@zero-panel/shared'
import { ulidSchema, portSchema } from '@zero-panel/shared'
import { nodeRepo } from '../storage/repos.js'
import { ok, newId } from './helpers.js'

const listQuery = z.object({
  sub_id: z.string().optional(),
  region: z.string().optional(),
  protocol: z.string().optional(),
  alive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  keyword: z.string().optional(),
})

const patchBody = z
  .object({
    region: z.string().optional(),
    manual_disabled: z.boolean().optional(),
  })
  .strict()

const createBody = z.object({
  sub_id: ulidSchema,
  name: z.string().min(1),
  protocol: nodeProtocolSchema,
  server: z.string().min(1),
  port: portSchema,
  params: z.record(z.unknown()).default({}),
  region: z.string().min(1).optional(),
})

export const registerNodeRoutes = async (app: FastifyInstance): Promise<void> => {
  const guard = { onRequest: [app.authenticate] }

  app.get('/api/nodes', guard, async (req, reply) => {
    const q = listQuery.parse(req.query)
    let items = await nodeRepo.list()
    if (q.sub_id) items = items.filter((n) => n.sub_id === q.sub_id)
    if (q.region) items = items.filter((n) => n.region === q.region)
    if (q.protocol) items = items.filter((n) => n.protocol === q.protocol)
    if (q.alive !== undefined) items = items.filter((n) => n.alive === q.alive)
    if (q.keyword) {
      const k = q.keyword.toLowerCase()
      items = items.filter(
        (n) =>
          n.name.toLowerCase().includes(k) ||
          n.server.toLowerCase().includes(k) ||
          n.region.toLowerCase().includes(k),
      )
    }
    return ok(reply, { items })
  })

  app.post('/api/nodes', guard, async (req, reply) => {
    const body = createBody.parse(req.body)
    const primaryAuth = body.params.uuid ?? body.params.password ?? ''
    const fingerprint = createHash('sha1')
      .update(`${body.protocol}|${body.server}|${body.port}|${primaryAuth}`)
      .digest('hex')
      .slice(0, 32)
    const node = await nodeRepo.create({
      id: newId(),
      sub_id: body.sub_id,
      fingerprint,
      raw: `${body.protocol}://${body.server}:${body.port}`,
      name: body.name,
      region: body.region ?? 'UNKNOWN',
      protocol: body.protocol,
      server: body.server,
      port: body.port,
      params: body.params,
      alive: false,
    })
    return ok(reply, node)
  })

  app.get('/api/nodes/regions', guard, async (_req, reply) => {
    const items = await nodeRepo.list()
    const counts = new Map<string, number>()
    for (const n of items) counts.set(n.region, (counts.get(n.region) ?? 0) + 1)
    const out = [...counts.entries()].map(([region, count]) => ({ region, count }))
    out.sort((a, b) => b.count - a.count)
    return ok(reply, { items: out })
  })

  app.get<{ Params: { id: string } }>('/api/nodes/:id', guard, async (req, reply) =>
    ok(reply, await nodeRepo.require(req.params.id)),
  )

  app.patch<{ Params: { id: string } }>('/api/nodes/:id', guard, async (req, reply) => {
    const patch = patchBody.parse(req.body)
    const updated = await nodeRepo.update(req.params.id, (cur) => ({ ...cur, ...patch }))
    return ok(reply, updated)
  })
}

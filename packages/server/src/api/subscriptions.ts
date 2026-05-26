import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { subscriptionTypeSchema, type Subscription } from '@zero-panel/shared'
import { subscriptionRepo, nodeRepo } from '../storage/repos.js'
import { ApiError } from './errors.js'
import { newId, nowMs, ok } from './helpers.js'
import { getScheduler } from '../subscription/scheduler.js'
import { readRawCache } from '../subscription/fetcher.js'

const createBody = z.object({
  name: z.string().min(1).max(64),
  url: z.string().url(),
  type: subscriptionTypeSchema.default('clash'),
  interval_seconds: z.number().int().min(300).default(1800),
  user_agent: z.string().optional(),
  enabled: z.boolean().default(true),
})

const patchBody = createBody.partial()

export const registerSubscriptionRoutes = async (app: FastifyInstance): Promise<void> => {
  const guard = { onRequest: [app.authenticate] }

  app.get('/api/subscriptions', guard, async (_req, reply) => {
    const items = await subscriptionRepo.list()
    return ok(reply, { items })
  })

  app.post('/api/subscriptions', guard, async (req, reply) => {
    const body = createBody.parse(req.body)
    const now = nowMs()
    const item: Subscription = {
      id: newId(),
      ...body,
      created_at: now,
      updated_at: now,
    }
    await subscriptionRepo.create(item)
    return ok(reply, item, 201)
  })

  app.get<{ Params: { id: string } }>(
    '/api/subscriptions/:id',
    guard,
    async (req, reply) => ok(reply, await subscriptionRepo.require(req.params.id)),
  )

  app.patch<{ Params: { id: string } }>(
    '/api/subscriptions/:id',
    guard,
    async (req, reply) => {
      const patch = patchBody.parse(req.body)
      const updated = await subscriptionRepo.update(req.params.id, (cur) => ({
        ...cur,
        ...patch,
        updated_at: nowMs(),
      }))
      return ok(reply, updated)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/subscriptions/:id',
    guard,
    async (req, reply) => {
      const id = req.params.id
      // Cascade: drop nodes belonging to this sub.
      const all = await nodeRepo.list()
      await nodeRepo.replaceAll(all.filter((n) => n.sub_id !== id))
      await subscriptionRepo.remove(id)
      return ok(reply, { removed: true })
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/subscriptions/:id/sync',
    guard,
    async (req, reply) => {
      const result = await getScheduler().runOnce(req.params.id)
      if (!result.ok) throw new ApiError(409, 'SYNC_FAILED', result.error ?? 'sync failed')
      return ok(reply, result)
    },
  )

  app.post('/api/subscriptions/sync-all', guard, async (_req, reply) => {
    const subs = await subscriptionRepo.list()
    const out = []
    for (const s of subs) {
      if (!s.enabled) continue
      out.push(await getScheduler().runOnce(s.id))
    }
    return ok(reply, { results: out })
  })

  app.get<{ Params: { id: string } }>(
    '/api/subscriptions/:id/raw',
    guard,
    async (req, reply) => {
      const sub = await subscriptionRepo.require(req.params.id)
      const raw = await readRawCache(sub.id)
      if (!raw) throw new ApiError(404, 'NOT_FOUND', 'raw cache not found')
      reply.type('text/plain').send(raw)
    },
  )
}

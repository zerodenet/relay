import type { FastifyInstance } from 'fastify'
import { getCurrentStats } from '../stats/collector.js'
import { ok } from './helpers.js'

export const registerStatsRoutes = async (app: FastifyInstance): Promise<void> => {
  const guard = { onRequest: [app.authenticate] }

  app.get('/api/stats/current', guard, async (_req, reply) =>
    ok(reply, getCurrentStats()),
  )

  app.get('/api/stats/summary', guard, async (_req, reply) => {
    const s = getCurrentStats()
    let totalUp = 0
    let totalDown = 0
    let totalConns = 0
    for (const c of Object.values(s.inbounds)) {
      totalUp += c.bytes_up
      totalDown += c.bytes_down
      totalConns += c.active_conns
    }
    return ok(reply, { bytes_up: totalUp, bytes_down: totalDown, active_conns: totalConns })
  })
}

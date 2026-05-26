/**
 * Entry point.
 *   1. ensure data directory layout & default settings
 *   2. boot Fastify with CORS, JWT, swagger
 *   3. wire baseline + entity API routes
 *   4. start kernel supervisor & subscription scheduler
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import sensible from '@fastify/sensible'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ensureLayout, ensureSettings } from './storage/bootstrap.js'
import { loadSettings, parseListen } from './config.js'
import { registerAuthHook } from './auth/hook.js'
import { registerErrorHandler } from './api/errors.js'
import { registerAuthRoutes } from './api/auth.js'
import { registerSystemRoutes } from './api/system.js'
import { registerSubscriptionRoutes } from './api/subscriptions.js'
import { registerNodeRoutes } from './api/nodes.js'
import { registerTunnelRoutes } from './api/tunnels.js'
import { registerForwardRoutes } from './api/forwards.js'
import { registerEventsRoute } from './api/events.js'
import { registerStatsRoutes } from './api/stats.js'
import { initSupervisor } from './kernel/supervisor.js'
import { initScheduler } from './subscription/scheduler.js'
import { startStatsCollector, stopStatsCollector } from './stats/collector.js'
import { emitLog } from './events/bus.js'

async function main() {
  await ensureLayout()
  const { created, initialPassword } = await ensureSettings()
  const settings = await loadSettings()

  if (created && initialPassword) {
    process.stderr.write('\n========================================================\n')
    process.stderr.write(' Zero Relay Panel — first launch\n')
    process.stderr.write(` Initial admin password: ${initialPassword}\n`)
    process.stderr.write(' Please log in and change it immediately.\n')
    process.stderr.write('========================================================\n\n')
  }

  const app = Fastify({
    logger: {
      level: settings.features.log_level,
      transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
    trustProxy: true,
  })

  // Tolerate empty bodies on POST/PATCH action endpoints.
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const s = (body as string).trim()
    if (!s) return done(null, undefined)
    try {
      done(null, JSON.parse(s))
    } catch (err) {
      done(err as Error, undefined)
    }
  })
  app.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined))

  await app.register(sensible)
  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwt, { secret: settings.panel.session_secret })

  if (process.env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: { info: { title: 'Zero Relay Panel API', version: '0.0.1' } },
    })
    await app.register(swaggerUi, { routePrefix: '/api/docs' })
  }

  registerAuthHook(app)
  registerErrorHandler(app)

  await app.register(registerAuthRoutes)
  await app.register(registerSystemRoutes)
  await app.register(registerSubscriptionRoutes)
  await app.register(registerNodeRoutes)
  await app.register(registerTunnelRoutes)
  await app.register(registerForwardRoutes)
  await app.register(registerEventsRoute)
  await app.register(registerStatsRoutes)

  app.get('/api/health', async () => ({ ok: true, data: { status: 'up' } }))

  // ─── SPA static hosting ──────────────────────────
  // Resolve order:
  //   1. ZERO_WEB_DIR env (deploy override)
  //   2. <server-package>/web              (after install copies it next to dist/)
  //   3. <repo>/packages/web/dist          (monorepo dev/build)
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    process.env.ZERO_WEB_DIR,
    resolve(here, '..', 'web'),
    resolve(here, '..', '..', 'web', 'dist'),
  ].filter((v): v is string => Boolean(v))
  const webDist = candidates.find((p) => existsSync(p))
  if (webDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      wildcard: false,
      schemaHide: true,
    })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'route not found' } })
      }
      return reply.type('text/html').sendFile('index.html')
    })
    app.log.info({ dir: webDist }, 'Serving web SPA')
  } else {
    app.log.warn({ tried: candidates }, 'Web dist not found; API-only mode')
  }

  // Background: kernel supervisor & subscription scheduler
  const supervisor = initSupervisor(settings)
  await supervisor.refresh().catch((err) =>
    emitLog('warn', `kernel detection failed: ${(err as Error).message}`, 'kernel'),
  )
  supervisor.startHealthLoop()

  const scheduler = initScheduler()
  scheduler.start()

  await startStatsCollector().catch((err) =>
    emitLog('warn', `stats collector start failed: ${(err as Error).message}`, 'stats'),
  )

  const { host, port } = parseListen(settings.panel.listen)
  await app.listen({ host, port })
  app.log.info({ host, port }, 'Zero Relay Panel listening')

  const shutdown = async () => {
    app.log.info('shutting down')
    supervisor.stopHealthLoop()
    scheduler.stop()
    await stopStatsCollector().catch(() => undefined)
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

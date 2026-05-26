import type { FastifyInstance } from 'fastify'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { getSupervisor } from '../kernel/supervisor.js'
import { listSnapshots, readSnapshot } from '../compiler/snapshots.js'
import { preview, apply, type ApplyResult } from '../compiler/apply.js'
import { getCachedSettings } from '../config.js'
import { ok } from './helpers.js'

const expandTilde = (p: string): string => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

const startedAt = Date.now()

export const registerSystemRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/api/system/info', async (_req, reply) => {
    const sv = getSupervisor()
    const state = sv.getState()
    return ok(reply, {
      panel_version: '0.0.1',
      uptime_ms: Date.now() - startedAt,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      kernel: {
        installed: state.installed,
        running: state.running,
        version: state.version,
      },
    })
  })

  app.get('/api/system/kernel', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const state = await getSupervisor().refresh()
    return ok(reply, {
      installed: state.installed,
      running: state.running,
      version: state.version,
      pid: state.pid,
      control: state.control,
      last_error: state.last_error,
    })
  })

  app.post('/api/system/kernel/start', { onRequest: [app.authenticate] }, async (_req, reply) => {
    await getSupervisor().start()
    return ok(reply, { started: true })
  })

  app.post('/api/system/kernel/stop', { onRequest: [app.authenticate] }, async (_req, reply) => {
    await getSupervisor().stop()
    return ok(reply, { stopped: true })
  })

  app.post('/api/system/kernel/restart', { onRequest: [app.authenticate] }, async (_req, reply) => {
    await getSupervisor().restart()
    return ok(reply, { restarted: true })
  })

  // ─── Config preview (dry-run) ───────────────────

  app.get('/api/system/config/preview', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const result = await preview()
    return ok(reply, result)
  })

  // ─── Config apply ───────────────────────────────

  app.post('/api/system/config/apply', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const result: ApplyResult = await apply()
    return ok(reply, result)
  })

  // ─── Snapshots ─────────────────────────────────

  app.get('/api/system/snapshots', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const names = await listSnapshots()
    return ok(reply, { items: names })
  })

  app.get<{ Params: { name: string } }>(
    '/api/system/snapshots/:name',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const snap = await readSnapshot(req.params.name)
      if (!snap) return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'snapshot not found' } })
      return ok(reply, snap)
    },
  )

  app.post<{ Params: { name: string } }>(
    '/api/system/snapshots/:name/rollback',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const snap = await readSnapshot(req.params.name)
      if (!snap) return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'snapshot not found' } })

      const settings = getCachedSettings()
      const configPath = expandTilde(settings.kernel.config_path)
      await mkdir(dirname(configPath), { recursive: true })
      await writeFile(configPath, JSON.stringify(snap.config, null, 2), 'utf8')

      const sv = getSupervisor()
      const client = await sv.getClient()
      if (client) {
        try {
          await client.command('config.apply', { config: snap.config })
        } catch {
          // best effort
        }
      }
      return ok(reply, { rolled_back: req.params.name, applied_at: snap.applied_at })
    },
  )
}

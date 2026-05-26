import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getCachedSettings, saveSettings } from '../config.js'

const loginBody = z.object({ password: z.string().min(1) })
const changeBody = z.object({ old: z.string().min(1), new: z.string().min(8) })

export const registerAuthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/api/auth/login', async (req, reply) => {
    const body = loginBody.safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'password required' } })
    }
    const settings = getCachedSettings()
    const ok = await argon2.verify(settings.panel.password_hash, body.data.password)
    if (!ok) {
      return reply.code(401).send({ ok: false, error: { code: 'INVALID_PASSWORD', message: 'invalid password' } })
    }
    const token = await reply.jwtSign({ sub: 'admin' }, { expiresIn: '7d' })
    return { ok: true, data: { token, expires_at: Date.now() + 7 * 86400 * 1000 } }
  })

  app.get('/api/auth/me', { onRequest: [app.authenticate] }, async (req) => ({
    ok: true,
    data: { sub: req.user.sub },
  }))

  app.post('/api/auth/logout', { onRequest: [app.authenticate] }, async () => ({
    ok: true,
    data: { revoked: true },
  }))

  app.post('/api/auth/change-password', { onRequest: [app.authenticate] }, async (req, reply) => {
    const body = changeBody.safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'invalid body' } })
    }
    const settings = getCachedSettings()
    const ok = await argon2.verify(settings.panel.password_hash, body.data.old)
    if (!ok) {
      return reply.code(401).send({ ok: false, error: { code: 'INVALID_PASSWORD', message: 'old password mismatch' } })
    }
    const password_hash = await argon2.hash(body.data.new, { type: argon2.argon2id })
    await saveSettings({ ...settings, panel: { ...settings.panel, password_hash } })
    return { ok: true, data: { changed: true } }
  })
}

/**
 * Helpers shared by entity API routes.
 */
import { ulid } from 'ulid'
import type { FastifyReply } from 'fastify'

export const nowMs = (): number => Date.now()
export const newId = (): string => ulid()

export const ok = <T>(reply: FastifyReply, data: T, code = 200): void => {
  reply.code(code).send({ ok: true, data })
}

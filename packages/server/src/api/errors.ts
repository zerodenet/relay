/**
 * Centralised error mapping: convert known errors to API responses.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { EntityConflictError, EntityNotFoundError } from '../storage/entity-repo.js'

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message)
  }
}

export const sendError = (reply: FastifyReply, err: unknown): void => {
  if (err instanceof ApiError) {
    reply.code(err.statusCode).send({
      ok: false,
      error: { code: err.code, message: err.message, detail: err.detail },
    })
    return
  }
  if (err instanceof EntityNotFoundError) {
    reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: err.message } })
    return
  }
  if (err instanceof EntityConflictError) {
    reply.code(409).send({ ok: false, error: { code: 'CONFLICT', message: err.message } })
    return
  }
  if (err instanceof ZodError) {
    reply.code(400).send({
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'invalid payload', detail: err.flatten() },
    })
    return
  }
  reply.log.error(err, 'unhandled error')
  reply.code(500).send({
    ok: false,
    error: { code: 'INTERNAL', message: (err as Error).message ?? 'internal error' },
  })
}

export const registerErrorHandler = (app: FastifyInstance): void => {
  app.setErrorHandler((err, _req, reply) => sendError(reply, err))
}

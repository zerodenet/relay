import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: 'admin' }
    user: { sub: 'admin' }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export const registerAuthHook = (app: FastifyInstance): void => {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'login required' } })
    }
  })
}

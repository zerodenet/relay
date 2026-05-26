/**
 * Server-Sent Events bridge: forward eventBus -> client.
 */
import type { FastifyInstance } from 'fastify'
import { eventBus } from '../events/bus.js'

export const registerEventsRoute = async (app: FastifyInstance): Promise<void> => {
  app.get('/api/events', { onRequest: [app.authenticate] }, async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const send = (line: string) => {
      reply.raw.write(line)
    }

    send(`: connected\n\n`)

    const heartbeat = setInterval(() => send(`: ping\n\n`), 20_000)
    const unsubscribe = eventBus.subscribe((evt) => {
      send(`event: ${evt.type}\n`)
      send(`data: ${JSON.stringify(evt)}\n\n`)
    })

    req.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      reply.raw.end()
    })
  })
}

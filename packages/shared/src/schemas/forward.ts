/**
 * Forward rule = the central abstraction.
 *
 * One rule expresses:
 *   "expose <listen>:<port> on this server, using <listen_protocol> as the local entry,
 *    forward all traffic through <tunnel_chain> (subscription tunnels) to <destination>."
 *
 *   listen_protocol:
 *     - 'mixed'  — SOCKS5/HTTP combined, no auth (default L4-ish entrypoint)
 *     - 'socks'  — SOCKS5 only, no auth
 *     - 'http'   — HTTP CONNECT only, no auth
 *
 * destination:
 *     - omitted (or null) → behave as a generic SOCKS/HTTP gateway: client decides target
 *     - present           → fixed-target dokodemo-style: ignore client target, always go to <address>:<port>
 *
 * tunnel_chain:
 *     - ordered list of tunnel IDs.
 *     - len == 1: traffic goes through that tunnel only.
 *     - len > 1:  outbounds chained left-to-right (relay -> landing).
 */
import { z } from 'zod'
import { fileEnvelope, portSchema, ulidSchema } from './common.js'

export const forwardListenProtocolSchema = z.enum(['mixed', 'socks', 'http'])

export const forwardDestinationSchema = z.object({
  address: z.string().min(1),
  port: portSchema,
})

export const forwardSchema = z.object({
  id: ulidSchema,
  name: z.string().min(1).max(64),
  listen: z.string().default('0.0.0.0'),
  port: portSchema,
  listen_protocol: forwardListenProtocolSchema.default('mixed'),
  destination: forwardDestinationSchema.optional(),
  tunnel_chain: z.array(ulidSchema).min(1),
  enabled: z.boolean().default(true),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

export const forwardsFileSchema = fileEnvelope(forwardSchema)

export type Forward = z.infer<typeof forwardSchema>
export type ForwardListenProtocol = z.infer<typeof forwardListenProtocolSchema>
export type ForwardDestination = z.infer<typeof forwardDestinationSchema>

import { z } from 'zod'
import { fileEnvelope, portSchema, ulidSchema } from './common.js'

export const nodeProtocolSchema = z.enum([
  'vless',
  'vmess',
  'trojan',
  'shadowsocks',
  'hysteria2',
  'tuic',
  'socks',
  'http',
])

export const nodeSchema = z.object({
  id: ulidSchema,
  sub_id: ulidSchema,
  fingerprint: z.string().min(8),
  raw: z.string(),
  name: z.string().min(1),
  region: z.string().min(1).default('UNKNOWN'),
  protocol: nodeProtocolSchema,
  server: z.string().min(1),
  port: portSchema,
  params: z.record(z.unknown()),
  alive: z.boolean().default(false),
  latency_ms: z.number().int().optional(),
  last_probe_at: z.number().int().optional(),
  banned_until: z.number().int().optional(),
  manual_disabled: z.boolean().optional(),
})

export const nodesFileSchema = fileEnvelope(nodeSchema)

export type Node = z.infer<typeof nodeSchema>
export type NodeProtocol = z.infer<typeof nodeProtocolSchema>

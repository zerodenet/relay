import { z } from 'zod'
import { fileEnvelope, ulidSchema } from './common.js'

export const tunnelTypeSchema = z.enum([
  'selector',
  'urltest',
  'fallback',
  'round_robin',
  'chain',
])

export const tunnelMemberSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('node'), node_id: ulidSchema }),
  z.object({ kind: z.literal('tunnel'), tunnel_id: ulidSchema }),
])

export const tunnelPolicySchema = z.object({
  test_url: z.string().url().optional(),
  test_interval_seconds: z.number().int().min(30).optional(),
  failure_threshold: z.number().int().min(1).optional(),
  backoff_seconds: z.number().int().min(10).optional(),
  max_concurrent: z.number().int().min(1).optional(),
  sticky_seconds: z.number().int().min(0).optional(),
})

export const tunnelRegionFilterSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  auto_sync: z.boolean().default(false),
})

export const tunnelSchema = z.object({
  id: ulidSchema,
  name: z.string().min(1).max(64),
  type: tunnelTypeSchema,
  members: z.array(tunnelMemberSchema),
  policy: tunnelPolicySchema.default({}),
  region_filter: tunnelRegionFilterSchema.optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

export const tunnelsFileSchema = fileEnvelope(tunnelSchema)

export type Tunnel = z.infer<typeof tunnelSchema>
export type TunnelType = z.infer<typeof tunnelTypeSchema>
export type TunnelMember = z.infer<typeof tunnelMemberSchema>

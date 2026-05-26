import { z } from 'zod'
import { fileEnvelope, ulidSchema } from './common.js'

export const subscriptionTypeSchema = z.enum(['clash', 'v2ray', 'singbox'])

export const subscriptionSchema = z.object({
  id: ulidSchema,
  name: z.string().min(1).max(64),
  url: z.string().url(),
  type: subscriptionTypeSchema,
  interval_seconds: z.number().int().min(300).default(1800),
  user_agent: z.string().optional(),
  enabled: z.boolean().default(true),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  last_sync_at: z.number().int().optional(),
  last_sync_ok: z.boolean().optional(),
  last_error: z.string().optional(),
  node_count: z.number().int().min(0).optional(),
})

export const subscriptionsFileSchema = fileEnvelope(subscriptionSchema)

export type Subscription = z.infer<typeof subscriptionSchema>
export type SubscriptionType = z.infer<typeof subscriptionTypeSchema>

import { z } from 'zod'
import { SCHEMA_VERSION } from './common.js'

export const inboundCounterSchema = z.object({
  bytes_up: z.number().int().min(0),
  bytes_down: z.number().int().min(0),
  active_conns: z.number().int().min(0),
  total_conns: z.number().int().min(0),
})

export const tunnelCounterSchema = z.object({
  bytes_up: z.number().int().min(0),
  bytes_down: z.number().int().min(0),
  selected_member: z.string().optional(),
  health_score: z.number().min(0).max(100),
  active_conns: z.number().int().min(0),
})

export const currentStatsSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  updated_at: z.number().int(),
  inbounds: z.record(inboundCounterSchema),
  tunnels: z.record(tunnelCounterSchema),
})

export const hourlyBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  inbounds: z.record(inboundCounterSchema),
  tunnels: z.record(tunnelCounterSchema),
})

export const hourlyFileSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buckets: z.array(hourlyBucketSchema),
})

export const dailyBucketSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inbounds: z.record(inboundCounterSchema),
  tunnels: z.record(tunnelCounterSchema),
})

export const dailyFileSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  retention_days: z.number().int().min(1).default(90),
  items: z.array(dailyBucketSchema),
})

export type InboundCounter = z.infer<typeof inboundCounterSchema>
export type TunnelCounter = z.infer<typeof tunnelCounterSchema>
export type CurrentStats = z.infer<typeof currentStatsSchema>
export type HourlyBucket = z.infer<typeof hourlyBucketSchema>
export type HourlyFile = z.infer<typeof hourlyFileSchema>
export type DailyBucket = z.infer<typeof dailyBucketSchema>
export type DailyFile = z.infer<typeof dailyFileSchema>

/**
 * Common primitives shared by all schemas.
 */
import { z } from 'zod'

export const SCHEMA_VERSION = 1 as const

export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be ULID')

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'must be a slug (lowercase, digits, _ or -)')

export const portSchema = z.number().int().min(1).max(65535)

export const cidrSchema = z
  .string()
  .regex(
    /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$|^[0-9a-fA-F:]+(?:\/\d{1,3})?$/,
    'must be IPv4/IPv6 CIDR or address',
  )

export const fileEnvelope = <T extends z.ZodTypeAny>(items: T) =>
  z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    items: z.array(items),
  })

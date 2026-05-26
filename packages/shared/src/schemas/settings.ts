import { z } from 'zod'
import { SCHEMA_VERSION, portSchema } from './common.js'

export const settingsSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  panel: z.object({
    listen: z.string().default('0.0.0.0:8080'),
    base_url: z.string().optional(),
    session_secret: z.string().min(32),
    password_hash: z.string().min(1),
  }),
  kernel: z.object({
    binary_path: z.string().default('/usr/local/bin/zero'),
    config_path: z.string().default('/etc/zero/config.json'),
    control_socket: z.string().default('~/.zero/control.sock'),
    control_http: z.string().optional(),
    auth_token: z.string().optional(),
    manage_mode: z.enum(['spawn', 'systemd', 'external']).default('spawn'),
    systemd_unit: z.string().optional(),
  }),
  features: z.object({
    auto_probe: z.boolean().default(true),
    probe_interval_seconds: z.number().int().min(30).default(300),
    probe_url: z.string().url().default('http://www.gstatic.com/generate_204'),
    auto_blacklist: z.boolean().default(true),
    failure_threshold: z.number().int().min(1).default(3),
    backoff_seconds: z.number().int().min(10).default(60),
    log_level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  }),
})

export type Settings = z.infer<typeof settingsSchema>

export const kernelStatusSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  installed: z.boolean(),
  binary_path: z.string().optional(),
  version: z.string().optional(),
  pid: z.number().int().optional(),
  running: z.boolean(),
  last_health_check_at: z.number().int().optional(),
  last_error: z.string().optional(),
  control: z
    .object({
      mode: z.enum(['ipc', 'http']),
      target: z.string(),
    })
    .optional(),
  listen_ports: z.array(portSchema).optional(),
})

export type KernelStatus = z.infer<typeof kernelStatusSchema>

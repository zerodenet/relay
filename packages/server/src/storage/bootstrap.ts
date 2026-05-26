/**
 * Bootstrap on first run:
 *   - create panel home directory tree
 *   - generate settings.json with random session_secret + admin password
 *
 * Initial admin password is printed to stderr ONCE, never persisted in plain text.
 */
import { mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { settingsSchema, SCHEMA_VERSION, type Settings } from '@zero-panel/shared'
import { paths } from './paths.js'
import { readJson, writeJson } from './json-store.js'

const generatePassword = (): string =>
  randomBytes(12)
    .toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, 16)

const generateSecret = (): string => randomBytes(48).toString('hex')

export async function ensureLayout(): Promise<void> {
  const dirs = [
    paths.home,
    paths.data,
    paths.stats,
    paths.statsHourlyDir,
    paths.statsArchive,
    paths.cache,
    paths.cacheSubs,
    paths.snapshots,
    paths.certs,
  ]
  for (const d of dirs) {
    await mkdir(d, { recursive: true })
  }
}

export async function ensureSettings(): Promise<{ settings: Settings; created: boolean; initialPassword?: string }> {
  try {
    const settings = await readJson(paths.settings, settingsSchema)
    return { settings, created: false }
  } catch {
    // create
  }

  const initialPassword = process.env.ZERO_PANEL_INITIAL_PASSWORD ?? generatePassword()
  const password_hash = await argon2.hash(initialPassword, { type: argon2.argon2id })

  const settings: Settings = {
    schema_version: SCHEMA_VERSION,
    panel: {
      listen: process.env.ZERO_PANEL_LISTEN ?? '0.0.0.0:8080',
      session_secret: generateSecret(),
      password_hash,
    },
    kernel: {
      binary_path: process.env.ZERO_BINARY ?? '/usr/local/bin/zero',
      config_path: process.env.ZERO_CONFIG ?? '/etc/zero/config.json',
      control_socket: process.env.ZERO_CONTROL_SOCK ?? '~/.zero/control.sock',
      manage_mode: 'spawn',
    },
    features: {
      auto_probe: true,
      probe_interval_seconds: 300,
      probe_url: 'http://www.gstatic.com/generate_204',
      auto_blacklist: true,
      failure_threshold: 3,
      backoff_seconds: 60,
      log_level: 'info',
    },
  }

  await writeJson(paths.settings, settingsSchema, settings)
  return { settings, created: true, initialPassword }
}

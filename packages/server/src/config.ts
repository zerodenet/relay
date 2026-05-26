/**
 * Runtime configuration loaded once at startup.
 */
import { settingsSchema, type Settings } from '@zero-panel/shared'
import { paths } from './storage/paths.js'
import { readJson, writeJson } from './storage/json-store.js'

let cached: Settings | null = null

export async function loadSettings(): Promise<Settings> {
  if (cached) return cached
  cached = await readJson(paths.settings, settingsSchema)
  return cached
}

export async function saveSettings(next: Settings): Promise<Settings> {
  await writeJson(paths.settings, settingsSchema, next)
  cached = next
  return next
}

export function getCachedSettings(): Settings {
  if (!cached) throw new Error('Settings not loaded')
  return cached
}

export function parseListen(listen: string): { host: string; port: number } {
  const idx = listen.lastIndexOf(':')
  if (idx < 0) throw new Error(`Invalid listen string: ${listen}`)
  const host = listen.slice(0, idx) || '0.0.0.0'
  const port = Number.parseInt(listen.slice(idx + 1), 10)
  if (!Number.isFinite(port)) throw new Error(`Invalid port in: ${listen}`)
  return { host, port }
}

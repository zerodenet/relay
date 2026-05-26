/**
 * High-level apply pipeline: model -> ZeroConfig -> kernel.
 */
import { createHash } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ZeroConfig } from './types.js'
import { build, type CompilerResult } from './index.js'
import { writeSnapshot, type Snapshot } from './snapshots.js'
import { forwardRepo, nodeRepo, tunnelRepo } from '../storage/repos.js'
import { getSupervisor } from '../kernel/supervisor.js'
import { getCachedSettings } from '../config.js'
import { emitKernel, emitLog } from '../events/bus.js'

const expandTilde = (p: string): string => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

const hashModel = (...objs: unknown[]): string =>
  createHash('sha256').update(JSON.stringify(objs)).digest('hex').slice(0, 16)

export interface PreviewResult extends CompilerResult {
  model_hash: string
}

export async function preview(): Promise<PreviewResult> {
  const [forwards, tunnels, nodes] = await Promise.all([
    forwardRepo.list(),
    tunnelRepo.list(),
    nodeRepo.list(),
  ])
  const result = build(nodes, tunnels, forwards)
  const model_hash = hashModel(forwards, tunnels, nodes)
  return { ...result, model_hash }
}

export interface ApplyResult {
  config: ZeroConfig
  snapshot_name: string
  applied_at: number
  warnings: string[]
}

export async function apply(): Promise<ApplyResult> {
  const result = await preview()
  if (result.errors.length > 0) {
    throw new Error(`compilation failed: ${result.errors.join('; ')}`)
  }

  const settings = getCachedSettings()
  const configPath = expandTilde(settings.kernel.config_path)
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(result.config, null, 2), 'utf8')

  const ts = Date.now()
  const snap: Snapshot = {
    applied_at: ts,
    source_model_hash: result.model_hash,
    config: result.config,
  }

  // Try live-apply via control plane first; fall back to "wrote-to-disk-only"
  // when the kernel is not running yet.
  const sv = getSupervisor()
  const client = await sv.getClient()
  if (client) {
    try {
      await client.command('config.apply', { config: result.config })
      emitKernel('config_changed', `applied snapshot at ${new Date(ts).toISOString()}`)
    } catch (err) {
      emitLog('warn', `live config.apply failed, kernel may need restart: ${(err as Error).message}`, 'compiler')
    }
  } else {
    emitLog('info', 'kernel not running; config written to disk only', 'compiler')
  }

  const snapshot_name = await writeSnapshot(ts, snap)
  return {
    config: result.config,
    snapshot_name,
    applied_at: ts,
    warnings: result.warnings,
  }
}

/**
 * Snapshot management: persist & retrieve Zero config snapshots.
 */
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ZeroConfig } from './types.js'
import { paths } from '../storage/paths.js'

export interface Snapshot {
  applied_at: number
  source_model_hash: string
  zero_version?: string
  config: ZeroConfig
}

const RETENTION = 50

function filename(ts: number): string {
  return new Date(ts).toISOString().replace(/[:.]/g, '-').replace('T', '_') + '.json'
}

export async function writeSnapshot(ts: number, snap: Snapshot): Promise<string> {
  await mkdir(paths.snapshots, { recursive: true })
  const name = filename(ts)
  await writeFile(join(paths.snapshots, name), JSON.stringify(snap, null, 2), 'utf8')
  await pruneSnapshots()
  return name
}

export async function listSnapshots(): Promise<string[]> {
  try {
    const files = await readdir(paths.snapshots)
    return files.filter((f) => f.endsWith('.json')).sort().reverse()
  } catch {
    return []
  }
}

export async function readSnapshot(name: string): Promise<Snapshot | undefined> {
  try {
    const raw = await readFile(join(paths.snapshots, name), 'utf8')
    return JSON.parse(raw) as Snapshot
  } catch {
    return undefined
  }
}

export async function deleteSnapshot(name: string): Promise<void> {
  await unlink(join(paths.snapshots, name)).catch(() => undefined)
}

async function pruneSnapshots(): Promise<void> {
  const files = await listSnapshots()
  if (files.length <= RETENTION) return
  const toDelete = files.slice(RETENTION)
  for (const f of toDelete) {
    await deleteSnapshot(f)
  }
}

/**
 * Atomic JSON read/write with cross-process advisory locking.
 *
 * Write strategy: write to <file>.tmp, fsync, rename to <file>.
 * Lock strategy: proper-lockfile creates <file>.lock directory.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import lockfile from 'proper-lockfile'
import type { ZodTypeAny, z } from 'zod'

export interface JsonStoreOptions {
  /** Tolerate missing file by returning a default value. */
  defaultValue?: unknown
  /** Pretty print indent (default 2). */
  indent?: number
}

const ensureDir = async (file: string) => {
  await mkdir(dirname(file), { recursive: true })
}

export async function readJson<S extends ZodTypeAny>(
  file: string,
  schema: S,
  opts: JsonStoreOptions = {},
): Promise<z.infer<S>> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' && opts.defaultValue !== undefined) {
      return schema.parse(opts.defaultValue)
    }
    throw err
  }
  return schema.parse(JSON.parse(raw))
}

export async function writeJson<S extends ZodTypeAny>(
  file: string,
  schema: S,
  value: z.infer<S>,
  opts: JsonStoreOptions = {},
): Promise<void> {
  const validated = schema.parse(value)
  await ensureDir(file)
  // Acquire lock on the target file. proper-lockfile requires the file to exist
  // OR realpath:false; we use a sibling lock path to avoid that constraint.
  const release = await lockfile.lock(file, {
    realpath: false,
    retries: { retries: 5, factor: 1.5, minTimeout: 50, maxTimeout: 500 },
    stale: 10_000,
  })
  try {
    const tmp = `${file}.tmp`
    const json = JSON.stringify(validated, null, opts.indent ?? 2)
    await writeFile(tmp, json, { encoding: 'utf8', flag: 'w' })
    await rename(tmp, file)
  } finally {
    await release()
  }
}

export async function updateJson<S extends ZodTypeAny>(
  file: string,
  schema: S,
  updater: (current: z.infer<S>) => z.infer<S> | Promise<z.infer<S>>,
  opts: JsonStoreOptions = {},
): Promise<z.infer<S>> {
  const current = await readJson(file, schema, opts)
  const next = await updater(current)
  await writeJson(file, schema, next, opts)
  return next
}

/**
 * Generic CRUD wrapper around fileEnvelope-based JSON files.
 *
 * Each entity file looks like:
 *   { schema_version: 1, items: [...] }
 *
 * Items are required to have a string `id` field (we use ULID).
 */
import type { ZodTypeAny, z } from 'zod'
import { SCHEMA_VERSION } from '@zero-panel/shared'
import { readJson, updateJson } from './json-store.js'

export interface EntityFile<T> {
  schema_version: typeof SCHEMA_VERSION
  items: T[]
}

export interface EntityWithId {
  id: string
}

export class EntityRepository<S extends ZodTypeAny, T extends EntityWithId = z.infer<S>['items'][number]> {
  constructor(
    private readonly file: string,
    private readonly schema: S,
  ) {}

  private get defaultEnvelope(): EntityFile<T> {
    return { schema_version: SCHEMA_VERSION, items: [] }
  }

  async list(): Promise<T[]> {
    const env = (await readJson(this.file, this.schema, {
      defaultValue: this.defaultEnvelope,
    })) as EntityFile<T>
    return env.items
  }

  async get(id: string): Promise<T | undefined> {
    const items = await this.list()
    return items.find((it) => it.id === id)
  }

  async require(id: string): Promise<T> {
    const found = await this.get(id)
    if (!found) throw new EntityNotFoundError(id)
    return found
  }

  async create(item: T): Promise<T> {
    await updateJson<S>(
      this.file,
      this.schema,
      (current) => {
        const env = current as EntityFile<T>
        if (env.items.some((it) => it.id === item.id)) {
          throw new EntityConflictError(`id already exists: ${item.id}`)
        }
        return { schema_version: SCHEMA_VERSION, items: [...env.items, item] } as z.infer<S>
      },
      { defaultValue: this.defaultEnvelope },
    )
    return item
  }

  async update(id: string, patcher: (cur: T) => T): Promise<T> {
    let updated: T | undefined
    await updateJson<S>(
      this.file,
      this.schema,
      (current) => {
        const env = current as EntityFile<T>
        const idx = env.items.findIndex((it) => it.id === id)
        if (idx < 0) throw new EntityNotFoundError(id)
        const next = patcher(env.items[idx]!)
        updated = next
        const items = env.items.slice()
        items[idx] = next
        return { schema_version: SCHEMA_VERSION, items } as z.infer<S>
      },
      { defaultValue: this.defaultEnvelope },
    )
    return updated!
  }

  async remove(id: string): Promise<void> {
    await updateJson<S>(
      this.file,
      this.schema,
      (current) => {
        const env = current as EntityFile<T>
        return {
          schema_version: SCHEMA_VERSION,
          items: env.items.filter((it) => it.id !== id),
        } as z.infer<S>
      },
      { defaultValue: this.defaultEnvelope },
    )
  }

  async replaceAll(items: T[]): Promise<void> {
    await updateJson<S>(
      this.file,
      this.schema,
      () => ({ schema_version: SCHEMA_VERSION, items }) as z.infer<S>,
      { defaultValue: this.defaultEnvelope },
    )
  }

  async filter(predicate: (it: T) => boolean): Promise<T[]> {
    return (await this.list()).filter(predicate)
  }
}

export class EntityNotFoundError extends Error {
  code = 'NOT_FOUND' as const
  constructor(id: string) {
    super(`entity not found: ${id}`)
  }
}

export class EntityConflictError extends Error {
  code = 'CONFLICT' as const
}

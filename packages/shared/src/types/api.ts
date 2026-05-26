/**
 * Generic API envelope used by every REST endpoint.
 */
export type ApiOk<T> = { ok: true; data: T }
export type ApiErr = {
  ok: false
  error: { code: string; message: string; detail?: unknown }
}
export type ApiResponse<T> = ApiOk<T> | ApiErr

export type Paginated<T> = {
  items: T[]
  meta: { total: number; page: number; size: number }
}

export type ListQuery = {
  page?: number
  size?: number
  sort?: string
  order?: 'asc' | 'desc'
  keyword?: string
}

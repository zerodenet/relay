import type { ApiResponse } from '@zero-panel/shared'

const TOKEN_KEY = 'zp_token'

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY)

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const resp = await fetch(path, { ...init, headers })
  const json = (await resp.json().catch(() => null)) as ApiResponse<T> | null

  if (!resp.ok || !json || json.ok === false) {
    if (resp.status === 401) {
      clearToken()
      if (location.pathname !== '/login') location.href = '/login'
    }
    const code = json && json.ok === false ? json.error.code : `HTTP_${resp.status}`
    const msg = json && json.ok === false ? json.error.message : resp.statusText
    throw new ApiError(code, msg)
  }
  return json.data
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
}

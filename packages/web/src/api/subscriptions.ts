import { api } from './client'
import type { Subscription, Node } from '@zero-panel/shared'

export const subscriptionApi = {
  list: () => api.get<{ items: Subscription[] }>('/api/subscriptions'),
  create: (body: Partial<Subscription>) => api.post<Subscription>('/api/subscriptions', body),
  get: (id: string) => api.get<Subscription>(`/api/subscriptions/${id}`),
  update: (id: string, body: Partial<Subscription>) => api.patch<Subscription>(`/api/subscriptions/${id}`, body),
  delete: (id: string) => api.delete<{ removed: boolean }>(`/api/subscriptions/${id}`),
  sync: (id: string) => api.post<unknown>(`/api/subscriptions/${id}/sync`),
  syncAll: () => api.post<unknown>('/api/subscriptions/sync-all'),
}

export const nodeApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<{ items: Node[] }>(`/api/nodes${qs}`)
  },
  regions: () => api.get<{ items: { region: string; count: number }[] }>('/api/nodes/regions'),
  update: (id: string, body: { region?: string; manual_disabled?: boolean }) =>
    api.patch<Node>(`/api/nodes/${id}`, body),
}

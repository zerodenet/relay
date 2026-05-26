import { api } from './client'
import type { Forward } from '@zero-panel/shared'

export const forwardApi = {
  list: () => api.get<{ items: Forward[] }>('/api/forwards'),
  create: (body: Partial<Forward> & { name: string; port: number; tunnel_chain: string[] }) =>
    api.post<Forward>('/api/forwards', body),
  get: (id: string) => api.get<Forward>(`/api/forwards/${id}`),
  update: (id: string, body: Partial<Forward>) => api.patch<Forward>(`/api/forwards/${id}`, body),
  delete: (id: string) => api.delete<{ removed: boolean }>(`/api/forwards/${id}`),
  toggle: (id: string) => api.post<Forward>(`/api/forwards/${id}/toggle`),
}

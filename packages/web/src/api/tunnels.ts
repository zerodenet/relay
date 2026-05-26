import { api } from './client'
import type { Tunnel, TunnelMember } from '@zero-panel/shared'

export const tunnelApi = {
  list: () => api.get<{ items: Tunnel[] }>('/api/tunnels'),
  create: (body: Partial<Tunnel> & { name: string; type: Tunnel['type'] }) =>
    api.post<Tunnel>('/api/tunnels', body),
  get: (id: string) => api.get<Tunnel>(`/api/tunnels/${id}`),
  update: (id: string, body: Partial<Tunnel>) => api.patch<Tunnel>(`/api/tunnels/${id}`, body),
  delete: (id: string) => api.delete<{ removed: boolean }>(`/api/tunnels/${id}`),
  members: (id: string) => api.get<{ items: { kind: 'node'; node: unknown }[] }>(`/api/tunnels/${id}/members`),
}

import { api } from './client'
import type { CurrentStats } from '@zero-panel/shared'

export const statsApi = {
  current: () => api.get<CurrentStats>('/api/stats/current'),
  summary: () =>
    api.get<{ bytes_up: number; bytes_down: number; active_conns: number }>(
      '/api/stats/summary',
    ),
}

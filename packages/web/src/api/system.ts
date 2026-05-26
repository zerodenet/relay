import { api } from './client'

export interface PreviewResult {
  config: unknown
  warnings: string[]
  errors: string[]
  model_hash: string
}

export interface ApplyResult {
  config: unknown
  snapshot_name: string
  applied_at: number
  warnings: string[]
}

export interface SnapshotPayload {
  applied_at: number
  source_model_hash: string
  zero_version?: string
  config: unknown
}

export const systemApi = {
  info: () =>
    api.get<{
      panel_version: string
      uptime_ms: number
      node: string
      platform: string
      arch: string
      kernel: { installed: boolean; running: boolean; version?: string }
    }>('/api/system/info'),
  kernel: () =>
    api.get<{
      installed: boolean
      running: boolean
      version?: string
      pid?: number
      control?: { mode: 'ipc' | 'http'; target: string }
      last_error?: string
    }>('/api/system/kernel'),
  kernelStart: () => api.post<{ started: boolean }>('/api/system/kernel/start'),
  kernelStop: () => api.post<{ stopped: boolean }>('/api/system/kernel/stop'),
  kernelRestart: () => api.post<{ restarted: boolean }>('/api/system/kernel/restart'),

  preview: () => api.get<PreviewResult>('/api/system/config/preview'),
  apply: () => api.post<ApplyResult>('/api/system/config/apply'),

  snapshots: () => api.get<{ items: string[] }>('/api/system/snapshots'),
  snapshot: (name: string) =>
    api.get<SnapshotPayload>(`/api/system/snapshots/${encodeURIComponent(name)}`),
  rollback: (name: string) =>
    api.post<{ rolled_back: string; applied_at: number }>(
      `/api/system/snapshots/${encodeURIComponent(name)}/rollback`,
    ),
}


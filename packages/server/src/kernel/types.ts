/**
 * Common kernel client interfaces & message envelopes.
 *
 * These mirror the Zero control-plane spec:
 *   - HTTP:  GET /api/v1/<resource>, POST /api/v1/commands, GET /api/v1/events/stream (SSE)
 *   - IPC:   JSON-line over UDS, types: query | command | subscribe
 */

export type QueryRequest =
  | 'Runtime'
  | 'Config'
  | 'Stats'
  | 'Policies'
  | 'Capabilities'
  | 'Health'
  | { Policy: { policy_tag: string } }
  | { ActiveFlows: { limit: number; filter: Record<string, unknown> } }
  | { Flow: { flow_id: string } }

export type CommandMethod =
  | 'policies.select'
  | 'policies.probe'
  | 'flows.close'
  | 'config.apply'

export interface KernelEnvelope {
  ok: boolean
  result?: unknown
  error?: string
}

export interface KernelEvent {
  event_type: string
  event_id?: string
  occurred_at_unix_ms?: number
  payload?: Record<string, unknown>
}

export interface KernelClient {
  query<T = unknown>(req: QueryRequest): Promise<T>
  command<T = unknown>(method: CommandMethod, params: Record<string, unknown>): Promise<T>
  subscribe(events: string[], onEvent: (e: KernelEvent) => void): Promise<() => Promise<void>>
  health(): Promise<{ ok: boolean; version?: string }>
  close(): Promise<void>
}

export class KernelUnreachableError extends Error {
  code = 'KERNEL_UNREACHABLE' as const
}

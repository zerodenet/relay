/**
 * SSE event payloads pushed by the BFF to the web UI.
 * Mirrors a curated subset of Zero kernel events plus panel-derived metrics.
 */
import type { CurrentStats } from '../schemas/stats.js'

export type StatsEvent = {
  type: 'stats'
  ts: number
  payload: CurrentStats
}

export type FlowEvent = {
  type: 'flow'
  ts: number
  payload: {
    kind: 'started' | 'updated' | 'completed'
    flow_id: string
    inbound_tag?: string
    outbound_tag?: string
    bytes_up?: number
    bytes_down?: number
    duration_ms?: number
  }
}

export type KernelEvent = {
  type: 'kernel'
  ts: number
  payload: {
    kind: 'started' | 'stopped' | 'warning' | 'config_changed'
    detail?: string
  }
}

export type LogEvent = {
  type: 'log'
  ts: number
  payload: {
    level: 'error' | 'warn' | 'info' | 'debug'
    msg: string
    source?: string
  }
}

export type PanelEvent = StatsEvent | FlowEvent | KernelEvent | LogEvent

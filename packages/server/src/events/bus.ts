/**
 * Bus for panel-derived events forwarded to web UI via SSE.
 *
 * Used by the kernel client, subscription scheduler, stats collector, etc.
 */
import { EventEmitter } from 'node:events'
import type { PanelEvent } from '@zero-panel/shared'

class EventBus extends EventEmitter {
  publish(event: PanelEvent): void {
    this.emit('event', event)
  }
  subscribe(listener: (e: PanelEvent) => void): () => void {
    this.on('event', listener)
    return () => this.off('event', listener)
  }
}

export const eventBus = new EventBus()
eventBus.setMaxListeners(64)

export const emitLog = (level: 'error' | 'warn' | 'info' | 'debug', msg: string, source?: string): void => {
  eventBus.publish({ type: 'log', ts: Date.now(), payload: { level, msg, source } })
}

export const emitKernel = (
  kind: 'started' | 'stopped' | 'warning' | 'config_changed',
  detail?: string,
): void => {
  eventBus.publish({ type: 'kernel', ts: Date.now(), payload: { kind, detail } })
}

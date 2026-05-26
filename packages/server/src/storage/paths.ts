/**
 * Filesystem layout helpers. All paths are computed once at startup
 * from ZERO_PANEL_HOME (default: ~/.zero-panel).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

const expandTilde = (p: string): string => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

export const PANEL_HOME = expandTilde(process.env.ZERO_PANEL_HOME ?? '~/.zero-panel')

export const paths = {
  home: PANEL_HOME,
  settings: join(PANEL_HOME, 'settings.json'),
  kernelStatus: join(PANEL_HOME, 'kernel.json'),

  data: join(PANEL_HOME, 'data'),
  subscriptions: join(PANEL_HOME, 'data', 'subscriptions.json'),
  nodes: join(PANEL_HOME, 'data', 'nodes.json'),
  tunnels: join(PANEL_HOME, 'data', 'tunnels.json'),
  forwards: join(PANEL_HOME, 'data', 'forwards.json'),

  stats: join(PANEL_HOME, 'stats'),
  statsCurrent: join(PANEL_HOME, 'stats', 'current.json'),
  statsHourlyDir: join(PANEL_HOME, 'stats', 'hourly'),
  statsDaily: join(PANEL_HOME, 'stats', 'daily.json'),
  statsArchive: join(PANEL_HOME, 'stats', '.archive'),

  cache: join(PANEL_HOME, 'cache'),
  cacheSubs: join(PANEL_HOME, 'cache', 'subs'),

  snapshots: join(PANEL_HOME, 'snapshots'),

  certs: join(PANEL_HOME, 'certs'),
} as const

export type PanelPaths = typeof paths

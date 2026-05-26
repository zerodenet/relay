/**
 * Kernel lifecycle supervisor.
 *
 *   manage_mode = 'spawn'    -> we fork the binary as a child process
 *   manage_mode = 'systemd'  -> we shell out to `systemctl`
 *   manage_mode = 'external' -> we never start/stop, only observe
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { execFile as execFileCb } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Settings } from '@zero-panel/shared'
import { detectKernel } from './detector.js'
import type { KernelClient } from './types.js'
import { emitKernel, emitLog } from '../events/bus.js'

const execFile = promisify(execFileCb)
const expandTilde = (p: string): string => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

export interface SupervisorState {
  client?: KernelClient
  running: boolean
  pid?: number
  version?: string
  installed: boolean
  last_error?: string
  control?: { mode: 'ipc' | 'http'; target: string }
}

export class KernelSupervisor {
  private state: SupervisorState = { running: false, installed: false }
  private child?: ChildProcess
  private healthTimer?: NodeJS.Timeout

  constructor(private settings: Settings) {}

  getState(): SupervisorState {
    return this.state
  }

  /** Refresh the cached state by probing detector. */
  async refresh(): Promise<SupervisorState> {
    const { status, client } = await detectKernel(this.settings)
    this.state = {
      ...this.state,
      installed: status.installed,
      running: status.running,
      version: status.version,
      pid: status.pid,
      control: status.control,
      client,
    }
    return this.state
  }

  /** Start polling kernel health every N seconds. */
  startHealthLoop(intervalSeconds = 10): void {
    if (this.healthTimer) clearInterval(this.healthTimer)
    this.healthTimer = setInterval(() => {
      void this.refresh().catch((err) => {
        emitLog('warn', `kernel refresh failed: ${(err as Error).message}`, 'kernel.supervisor')
      })
    }, intervalSeconds * 1000)
  }

  stopHealthLoop(): void {
    if (this.healthTimer) clearInterval(this.healthTimer)
    this.healthTimer = undefined
  }

  async start(): Promise<void> {
    switch (this.settings.kernel.manage_mode) {
      case 'spawn':
        await this.spawnStart()
        break
      case 'systemd':
        await this.systemctl('start')
        break
      case 'external':
        emitLog('info', 'manage_mode=external; skipping start', 'kernel.supervisor')
        break
    }
    await this.waitForReady(15000)
    emitKernel('started')
  }

  async stop(): Promise<void> {
    switch (this.settings.kernel.manage_mode) {
      case 'spawn':
        await this.spawnStop()
        break
      case 'systemd':
        await this.systemctl('stop')
        break
      case 'external':
        emitLog('info', 'manage_mode=external; skipping stop', 'kernel.supervisor')
        break
    }
    emitKernel('stopped')
  }

  async restart(): Promise<void> {
    await this.stop().catch(() => undefined)
    await this.start()
  }

  private spawnStart(): Promise<void> {
    if (this.child && !this.child.killed) return Promise.resolve()
    const binary = expandTilde(this.settings.kernel.binary_path)
    const cfg = expandTilde(this.settings.kernel.config_path)
    const args = ['run', cfg]
    this.child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    this.child.stdout?.on('data', (b: Buffer) => emitLog('info', b.toString('utf8').trimEnd(), 'kernel'))
    this.child.stderr?.on('data', (b: Buffer) => emitLog('warn', b.toString('utf8').trimEnd(), 'kernel'))
    this.child.on('exit', (code) => {
      emitLog(code === 0 ? 'info' : 'warn', `kernel exited code=${code}`, 'kernel')
      this.state.running = false
      this.state.pid = undefined
    })
    this.state.pid = this.child.pid
    return Promise.resolve()
  }

  private async spawnStop(): Promise<void> {
    if (!this.child) return
    return new Promise<void>((resolve) => {
      const child = this.child!
      const t = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 5000)
      child.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }

  private async systemctl(action: 'start' | 'stop' | 'restart'): Promise<void> {
    const unit = this.settings.kernel.systemd_unit ?? 'zero'
    await execFile('systemctl', [action, unit])
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const { running } = await this.refresh()
      if (running) return
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('kernel did not become ready within timeout')
  }

  /** Get a usable client; refresh first if not present. */
  async getClient(): Promise<KernelClient | undefined> {
    if (!this.state.client) await this.refresh()
    return this.state.client
  }

  updateSettings(next: Settings): void {
    this.settings = next
  }
}

let supervisor: KernelSupervisor | null = null

export const initSupervisor = (settings: Settings): KernelSupervisor => {
  supervisor = new KernelSupervisor(settings)
  return supervisor
}

export const getSupervisor = (): KernelSupervisor => {
  if (!supervisor) throw new Error('Supervisor not initialised')
  return supervisor
}

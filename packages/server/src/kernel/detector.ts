/**
 * Detect whether the kernel binary exists & runtime is reachable.
 * Combines:
 *   1. binary on disk + --version
 *   2. control-plane reachability (IPC preferred)
 *   3. systemd unit (when manage_mode=systemd)
 */
import { spawn } from 'node:child_process'
import { access, constants, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { KernelStatus, Settings } from '@zero-panel/shared'
import { SCHEMA_VERSION } from '@zero-panel/shared'
import { paths } from '../storage/paths.js'
import { writeJson } from '../storage/json-store.js'
import { kernelStatusSchema } from '@zero-panel/shared'
import { IpcKernelClient } from './ipc-client.js'
import { HttpKernelClient } from './http-client.js'
import type { KernelClient } from './types.js'

const expandTilde = (p: string): string => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

export interface DetectionResult {
  status: KernelStatus
  client?: KernelClient
}

const checkExec = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.X_OK)
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

const probeVersion = (binary: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    let out = ''
    const child = spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (b) => (out += b.toString('utf8')))
    child.stderr.on('data', (b) => (out += b.toString('utf8')))
    const t = setTimeout(() => {
      child.kill()
      resolve(undefined)
    }, 3000)
    child.on('exit', () => {
      clearTimeout(t)
      const m = out.match(/v?\d+\.\d+\.\d+(?:-[\w.]+)?/)
      resolve(m ? m[0] : (out.trim().split('\n')[0] || undefined))
    })
    child.on('error', () => {
      clearTimeout(t)
      resolve(undefined)
    })
  })

export async function detectKernel(settings: Settings): Promise<DetectionResult> {
  const binary = expandTilde(settings.kernel.binary_path)
  const installed = await checkExec(binary)
  let version: string | undefined
  if (installed) version = await probeVersion(binary)

  // try IPC first
  let client: KernelClient | undefined
  let running = false
  let target: string | undefined
  let mode: 'ipc' | 'http' | undefined

  const ipcPath = expandTilde(settings.kernel.control_socket)
  const ipc = new IpcKernelClient({ socket_path: ipcPath })
  const ipcHealth = await ipc.health()
  if (ipcHealth.ok) {
    running = true
    client = ipc
    mode = 'ipc'
    target = ipcPath
    if (!version && ipcHealth.version) version = ipcHealth.version
  } else if (settings.kernel.control_http) {
    const http = new HttpKernelClient({
      base_url: settings.kernel.control_http,
      auth_token: settings.kernel.auth_token,
    })
    const h = await http.health()
    if (h.ok) {
      running = true
      client = http
      mode = 'http'
      target = settings.kernel.control_http
      if (!version && h.version) version = h.version
    }
  }

  const status: KernelStatus = {
    schema_version: SCHEMA_VERSION,
    installed,
    binary_path: installed ? binary : undefined,
    version,
    running,
    last_health_check_at: Date.now(),
    control: mode && target ? { mode, target } : undefined,
  }

  await writeJson(paths.kernelStatus, kernelStatusSchema, status)
  return { status, client }
}

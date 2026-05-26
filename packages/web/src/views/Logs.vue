<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { NCard, NSpace, NButton, NTag, NSwitch } from 'naive-ui'
import { getToken } from '@/api/client'

interface LogLine {
  ts: number
  type: string
  level?: string
  msg: string
  source?: string
}

const lines = ref<LogLine[]>([])
const paused = ref(false)
const maxLines = 500
let es: EventSource | null = null

function open() {
  const token = getToken()
  // EventSource doesn't support custom headers directly; pass via query.
  // Backend currently expects Bearer header — simple workaround: use fetch streaming.
  const url = `/api/events?topics=log,kernel,flow,stats`
  // Polyfill via fetch + ReadableStream so we can send Authorization header.
  const ctrl = new AbortController()
  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: ctrl.signal,
  }).then(async (resp) => {
    if (!resp.ok || !resp.body) return
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
        if (!dataLine) continue
        try {
          const evt = JSON.parse(dataLine.slice(5).trim())
          if (paused.value) continue
          appendEvent(evt)
        } catch {
          // skip
        }
      }
    }
  }).catch(() => undefined)
  es = { close: () => ctrl.abort() } as unknown as EventSource
}

function appendEvent(evt: { type: string; ts: number; payload?: any }) {
  const line: LogLine = {
    ts: evt.ts,
    type: evt.type,
    level: evt.payload?.level,
    msg: evt.payload?.msg || evt.payload?.detail || evt.payload?.kind || JSON.stringify(evt.payload),
    source: evt.payload?.source,
  }
  lines.value.push(line)
  if (lines.value.length > maxLines) lines.value.splice(0, lines.value.length - maxLines)
}

function clear() {
  lines.value = []
}

onMounted(open)
onBeforeUnmount(() => es?.close())

function levelType(l?: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  if (l === 'error') return 'error'
  if (l === 'warn') return 'warning'
  if (l === 'debug') return 'default'
  return 'info'
}
</script>

<template>
  <NCard title="实时日志">
    <template #header-extra>
      <NSpace align="center">
        <span style="font-size: 12px; opacity: .7">{{ lines.length }} 条</span>
        <NSwitch v-model:value="paused"><template #checked>已暂停</template><template #unchecked>实时</template></NSwitch>
        <NButton size="small" @click="clear">清空</NButton>
      </NSpace>
    </template>
    <div class="log-box">
      <div v-for="(l, i) in lines" :key="i" class="log-row">
        <span class="ts">{{ new Date(l.ts).toLocaleTimeString() }}</span>
        <NTag size="small" :type="levelType(l.level)" :bordered="false">{{ l.type }}</NTag>
        <span v-if="l.source" class="src">[{{ l.source }}]</span>
        <span class="msg">{{ l.msg }}</span>
      </div>
      <div v-if="!lines.length" class="empty">暂无日志</div>
    </div>
  </NCard>
</template>

<style scoped>
.log-box {
  height: calc(100vh - 220px);
  overflow-y: auto;
  font-family: ui-monospace, "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}
.log-row { display: flex; gap: 8px; padding: 2px 0; align-items: baseline; }
.ts { color: #888; flex-shrink: 0; }
.src { color: #6ea8fe; flex-shrink: 0; }
.msg { white-space: pre-wrap; word-break: break-all; }
.empty { color: #666; padding: 24px; text-align: center; }
</style>

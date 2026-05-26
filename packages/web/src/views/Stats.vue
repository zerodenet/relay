<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  NCard, NSpace, NDescriptions, NDescriptionsItem, NTag, NEmpty, NDataTable,
  NStatistic, NGrid, NGi, useMessage,
} from 'naive-ui'
import { useStatsStore } from '@/stores/stats'
import type { CurrentStats } from '@zero-panel/shared'
import { useForwardsStore } from '@/stores/forwards'
import { useTunnelsStore } from '@/stores/tunnels'

const stats = useStatsStore()
const fwdStore = useForwardsStore()
const tnStore = useTunnelsStore()
const msg = useMessage()

let timer: NodeJS.Timeout | undefined

onMounted(async () => {
  await Promise.all([stats.refresh(), fwdStore.fetchAll(), tnStore.fetchAll()])
  timer = setInterval(() => stats.refresh(), 30_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(2)} GB`
}

const fwdNameMap = computed(() => {
  const m = new Map<string, string>()
  for (const f of fwdStore.forwards) m.set(f.id, f.name)
  return m
})

const tnNameMap = computed(() => {
  const m = new Map<string, string>()
  for (const t of tnStore.tunnels) m.set(t.id, t.name)
  return m
})

const fwdColumns = [
  { title: '转发规则', key: 'name' },
  { title: '上行', key: 'up' },
  { title: '下行', key: 'down' },
  { title: '活跃连接', key: 'active' },
  { title: '总连接', key: 'total' },
]

const fwdRows = computed(() => {
  const c: CurrentStats | null = stats.current
  if (!c) return []
  return Object.entries(c.inbounds).map(([id, v]) => ({
    name: fwdNameMap.value.get(id) ?? id.slice(0, 8),
    up: fmtBytes(v.bytes_up),
    down: fmtBytes(v.bytes_down),
    active: v.active_conns,
    total: v.total_conns,
  }))
})

const tnColumns = [
  { title: '隧道', key: 'name' },
  { title: '上行', key: 'up' },
  { title: '下行', key: 'down' },
  { title: '健康分', key: 'health' },
  { title: '活跃连接', key: 'active' },
]

const tnRows = computed(() => {
  const c: CurrentStats | null = stats.current
  if (!c) return []
  return Object.entries(c.tunnels).map(([id, v]) => ({
    name: tnNameMap.value.get(id) ?? id.slice(0, 8),
    up: fmtBytes(v.bytes_up),
    down: fmtBytes(v.bytes_down),
    health: v.health_score,
    active: v.active_conns,
  }))
})
</script>

<template>
  <NSpace vertical :size="16">
    <NGrid :cols="4" :x-gap="12" :y-gap="12">
      <NGi>
        <NCard><NStatistic label="总上行" :value="fmtBytes(stats.summary?.bytes_up ?? 0)" /></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic label="总下行" :value="fmtBytes(stats.summary?.bytes_down ?? 0)" /></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic label="活跃连接" :value="stats.summary?.active_conns ?? 0" /></NCard>
      </NGi>
      <NGi>
        <NCard>
          <NStatistic label="数据来源">
            <template #default>
              <NTag :type="stats.current ? 'success' : 'default'" size="small">
                {{ stats.current ? '实时' : '无数据' }}
              </NTag>
            </template>
          </NStatistic>
        </NCard>
      </NGi>
    </NGrid>

    <NCard title="转发规则流量">
      <NDataTable v-if="fwdRows.length > 0" :columns="fwdColumns" :data="fwdRows" :bordered="true" size="small" />
      <NEmpty v-else description="暂无转发流量数据，需内核运行后产生" />
    </NCard>

    <NCard title="隧道流量">
      <NDataTable v-if="tnRows.length > 0" :columns="tnColumns" :data="tnRows" :bordered="true" size="small" />
      <NEmpty v-else description="暂无隧道流量数据，需内核运行后产生" />
    </NCard>

    <NDescriptions v-if="stats.current" bordered :column="1" label-placement="left" title="元信息">
      <NDescriptionsItem label="最后更新">{{ new Date(stats.current.updated_at).toLocaleString() }}</NDescriptionsItem>
    </NDescriptions>
  </NSpace>
</template>

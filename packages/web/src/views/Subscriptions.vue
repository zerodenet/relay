<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import {
  NCard, NButton, NDataTable, NSpace, NTag, NModal, NForm, NFormItem,
  NInput, NSelect, NInputNumber, NSwitch, NTabPane, NTabs, NPopconfirm,
  useMessage, type DataTableColumns,
} from 'naive-ui'
import { useSubscriptionsStore } from '@/stores/subscriptions'
import type { Subscription, Node } from '@zero-panel/shared'

const store = useSubscriptionsStore()
const msg = useMessage()
const tab = ref('subs')
const showModal = ref(false)
const form = ref({ name: '', url: '', type: 'clash' as const, interval_seconds: 1800 })

const typeOptions = [
  { label: 'Clash', value: 'clash' },
  { label: 'V2Ray', value: 'v2ray' },
  { label: 'sing-box', value: 'singbox' },
]

onMounted(() => {
  store.fetchSubs()
  store.fetchNodes()
  store.fetchRegions()
})

const subColumns: DataTableColumns<Subscription> = [
  { title: '名称', key: 'name', width: 120 },
  { title: '类型', key: 'type', width: 80, render: (r) => r.type.toUpperCase() },
  { title: '节点数', key: 'node_count', width: 70, render: (r) => r.node_count ?? '-' },
  { title: '状态', key: 'status', width: 80, render: (r) =>
    r.last_sync_ok ? h(NTag, { type: 'success', size: 'small' }, () => '正常') :
    r.last_error ? h(NTag, { type: 'error', size: 'small' }, () => '失败') :
    h(NTag, { size: 'small' }, () => '未同步')
  },
  { title: '上次同步', key: 'last_sync_at', width: 160, render: (r) =>
    r.last_sync_at ? new Date(r.last_sync_at).toLocaleString() : '-'
  },
  { title: '操作', key: 'actions', width: 180, render: (r) =>
    h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', onClick: () => doSync(r.id) }, () => '同步'),
      h(NPopconfirm, { onPositiveClick: () => doDelete(r.id) }, {
        trigger: () => h(NButton, { size: 'small', type: 'error' }, () => '删除'),
        default: () => `确认删除 "${r.name}"？节点也会被清理。`,
      }),
    ])
  },
]

const nodeColumns: DataTableColumns<Node> = [
  { title: '名称', key: 'name', ellipsis: { tooltip: true } },
  { title: '区域', key: 'region', width: 60, render: (r) =>
    h(NTag, { size: 'small', bordered: false }, () => r.region)
  },
  { title: '协议', key: 'protocol', width: 90 },
  { title: '地址', key: 'addr', width: 180, render: (r) => `${r.server}:${r.port}` },
  { title: '延迟', key: 'latency_ms', width: 70, render: (r) =>
    r.latency_ms != null ? `${r.latency_ms}ms` : '-'
  },
  { title: '状态', key: 'alive', width: 60, render: (r) =>
    r.banned_until && r.banned_until > Date.now()
      ? h(NTag, { type: 'warning', size: 'small' }, () => '封禁')
      : r.alive
        ? h(NTag, { type: 'success', size: 'small' }, () => '存活')
        : h(NTag, { type: 'error', size: 'small' }, () => '离线')
  },
]

async function doCreate() {
  try {
    await store.createSub(form.value)
    showModal.value = false
    form.value = { name: '', url: '', type: 'clash', interval_seconds: 1800 }
    msg.success('订阅已创建')
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doSync(id: string) {
  try {
    await store.syncSub(id)
    msg.success('同步完成')
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doDelete(id: string) {
  try {
    await store.deleteSub(id)
    msg.success('已删除')
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doSyncAll() {
  try {
    await store.syncAll()
    msg.success('全量同步完成')
  } catch (e) {
    msg.error((e as Error).message)
  }
}

import { h } from 'vue'
</script>

<template>
  <NCard title="订阅与节点">
    <template #header-extra>
      <NSpace>
        <NButton @click="doSyncAll" :loading="store.loading">全部同步</NButton>
        <NButton type="primary" @click="showModal = true">添加订阅</NButton>
      </NSpace>
    </template>

    <NTabs v-model:value="tab" type="line">
      <NTabPane name="subs" tab="订阅源">
        <NDataTable :columns="subColumns" :data="store.subs" :bordered="false" :loading="store.loading" />
      </NTabPane>
      <NTabPane name="nodes" tab="节点池">
        <NSpace style="margin-bottom: 12px" v-if="store.regions.length">
          <NTag v-for="r in store.regions" :key="r.region" size="small" round>
            {{ r.region }} {{ r.count }}
          </NTag>
        </NSpace>
        <NDataTable :columns="nodeColumns" :data="store.nodes" :bordered="false" :loading="store.loading" :pagination="{ pageSize: 20 }" />
      </NTabPane>
    </NTabs>

    <NModal v-model:show="showModal" preset="dialog" title="添加订阅" positive-text="创建" negative-text="取消"
      @positive-click="doCreate">
      <NForm label-placement="left" label-width="80">
        <NFormItem label="名称"><NInput v-model:value="form.name" placeholder="如：机场A" /></NFormItem>
        <NFormItem label="URL"><NInput v-model:value="form.url" placeholder="https://..." /></NFormItem>
        <NFormItem label="类型"><NSelect v-model:value="form.type" :options="typeOptions" /></NFormItem>
        <NFormItem label="间隔(秒)"><NInputNumber v-model:value="form.interval_seconds" :min="300" :step="300" /></NFormItem>
      </NForm>
    </NModal>
  </NCard>
</template>

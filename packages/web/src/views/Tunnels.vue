<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NDataTable, NSpace, NTag, NDrawer, NDrawerContent,
  NForm, NFormItem, NInput, NSelect, NInputNumber, NPopconfirm,
  NDivider, NTransfer, useMessage, type DataTableColumns,
} from 'naive-ui'
import { useTunnelsStore } from '@/stores/tunnels'
import { useSubscriptionsStore } from '@/stores/subscriptions'
import type { Tunnel, TunnelMember, TunnelType } from '@zero-panel/shared'

const tStore = useTunnelsStore()
const sStore = useSubscriptionsStore()
const msg = useMessage()

const drawer = ref(false)
const editing = ref<Tunnel | null>(null)
const form = ref<{
  name: string
  type: TunnelType
  members: TunnelMember[]
  policy: { test_url?: string; test_interval_seconds?: number; failure_threshold?: number; backoff_seconds?: number }
}>({
  name: '',
  type: 'urltest',
  members: [],
  policy: {},
})

const typeOptions: { label: string; value: TunnelType }[] = [
  { label: 'selector（手动选择）', value: 'selector' },
  { label: 'urltest（自动测速选最快）', value: 'urltest' },
  { label: 'fallback（故障转移）', value: 'fallback' },
  { label: 'round_robin（轮询）', value: 'round_robin' },
  { label: 'chain（链式）', value: 'chain' },
]

onMounted(() => {
  tStore.fetchAll()
  sStore.fetchNodes()
})

const transferOptions = computed(() => {
  const nodeOpts = sStore.nodes.map((n) => ({
    label: `[${n.region}] ${n.name}`,
    value: `n:${n.id}`,
    disabled: false,
  }))
  const tunnelOpts = tStore.tunnels
    .filter((t) => !editing.value || t.id !== editing.value.id)
    .map((t) => ({
      label: `[隧道] ${t.name}`,
      value: `t:${t.id}`,
      disabled: false,
    }))
  return [...tunnelOpts, ...nodeOpts]
})

const transferValues = computed({
  get: () => form.value.members.map((m) => (m.kind === 'node' ? `n:${m.node_id}` : `t:${m.tunnel_id}`)),
  set: (v: string[]) => {
    form.value.members = v.map((s) => {
      const [k, id] = s.split(':') as ['n' | 't', string]
      return k === 'n' ? { kind: 'node', node_id: id } : { kind: 'tunnel', tunnel_id: id }
    })
  },
})

function openCreate() {
  editing.value = null
  form.value = { name: '', type: 'urltest', members: [], policy: {} }
  drawer.value = true
}

function openEdit(t: Tunnel) {
  editing.value = t
  form.value = {
    name: t.name,
    type: t.type,
    members: [...t.members],
    policy: { ...t.policy },
  }
  drawer.value = true
}

async function doSave() {
  try {
    if (editing.value) {
      await tStore.update(editing.value.id, form.value)
      msg.success('已更新')
    } else {
      await tStore.create(form.value)
      msg.success('已创建')
    }
    drawer.value = false
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doDelete(id: string) {
  try {
    await tStore.remove(id)
    msg.success('已删除')
  } catch (e) {
    msg.error((e as Error).message)
  }
}

const columns: DataTableColumns<Tunnel> = [
  { title: '名称', key: 'name' },
  { title: '类型', key: 'type', width: 100, render: (r) =>
    h(NTag, { size: 'small', bordered: false }, () => r.type)
  },
  { title: '成员数', key: 'count', width: 80, render: (r) => r.members.length },
  { title: '更新时间', key: 'updated_at', width: 160, render: (r) =>
    new Date(r.updated_at).toLocaleString()
  },
  { title: '操作', key: 'actions', width: 180, render: (r) =>
    h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', onClick: () => openEdit(r) }, () => '编辑'),
      h(NPopconfirm, { onPositiveClick: () => doDelete(r.id) }, {
        trigger: () => h(NButton, { size: 'small', type: 'error' }, () => '删除'),
        default: () => `删除隧道 "${r.name}"？`,
      }),
    ])
  },
]

watch(drawer, (open) => {
  if (open) {
    sStore.fetchNodes()
    tStore.fetchAll()
  }
})
</script>

<template>
  <NCard title="隧道组">
    <template #header-extra>
      <NButton type="primary" @click="openCreate">新建隧道</NButton>
    </template>
    <NDataTable :columns="columns" :data="tStore.tunnels" :bordered="false" :loading="tStore.loading" />

    <NDrawer v-model:show="drawer" :width="640">
      <NDrawerContent :title="editing ? '编辑隧道' : '新建隧道'" closable>
        <NForm label-placement="left" label-width="100">
          <NFormItem label="名称"><NInput v-model:value="form.name" placeholder="如：HK-Pool" /></NFormItem>
          <NFormItem label="类型"><NSelect v-model:value="form.type" :options="typeOptions" /></NFormItem>

          <NDivider>策略</NDivider>
          <NFormItem label="测试 URL">
            <NInput v-model:value="form.policy.test_url" placeholder="http://www.gstatic.com/generate_204" />
          </NFormItem>
          <NFormItem label="测试间隔">
            <NInputNumber v-model:value="form.policy.test_interval_seconds" :min="30" placeholder="秒" />
          </NFormItem>
          <NFormItem label="失败阈值">
            <NInputNumber v-model:value="form.policy.failure_threshold" :min="1" />
          </NFormItem>
          <NFormItem label="退避时间">
            <NInputNumber v-model:value="form.policy.backoff_seconds" :min="10" placeholder="秒" />
          </NFormItem>

          <NDivider>成员</NDivider>
          <NTransfer
            v-model:value="transferValues"
            :options="transferOptions"
            source-title="可选"
            target-title="已选"
            :virtual-scroll="true"
            style="height: 320px"
          />
        </NForm>

        <template #footer>
          <NSpace>
            <NButton @click="drawer = false">取消</NButton>
            <NButton type="primary" @click="doSave">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </NCard>
</template>

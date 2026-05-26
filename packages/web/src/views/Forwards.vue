<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import {
  NCard, NButton, NDataTable, NSpace, NTag, NDrawer, NDrawerContent,
  NForm, NFormItem, NInput, NSelect, NInputNumber, NSwitch,
  NPopconfirm, useMessage, type DataTableColumns,
} from 'naive-ui'
import { useForwardsStore } from '@/stores/forwards'
import { useTunnelsStore } from '@/stores/tunnels'
import type { Forward, ForwardListenProtocol, ForwardDestination } from '@zero-panel/shared'

const fStore = useForwardsStore()
const tStore = useTunnelsStore()
const msg = useMessage()

const drawer = ref(false)
const editing = ref<Forward | null>(null)
const form = ref<{
  name: string
  listen: string
  port: number
  listen_protocol: ForwardListenProtocol
  destination: ForwardDestination | null
  tunnel_chain: string[]
}>({
  name: '',
  listen: '0.0.0.0',
  port: 0,
  listen_protocol: 'mixed',
  destination: null,
  tunnel_chain: [],
})

const protoOptions: { label: string; value: ForwardListenProtocol }[] = [
  { label: 'mixed (SOCKS5+HTTP)', value: 'mixed' },
  { label: 'socks5', value: 'socks' },
  { label: 'http', value: 'http' },
]

onMounted(() => {
  fStore.fetchAll()
  tStore.fetchAll()
})

const tunnelOptions = computed(() =>
  tStore.tunnels.map((t) => ({ label: `${t.name} (${t.type})`, value: t.id }))
)

const tunnelNameMap = computed(() => {
  const m = new Map<string, string>()
  for (const t of tStore.tunnels) m.set(t.id, t.name)
  return m
})

function openCreate() {
  editing.value = null
  form.value = { name: '', listen: '0.0.0.0', port: 0, listen_protocol: 'mixed', destination: null, tunnel_chain: [] }
  drawer.value = true
}

function openEdit(f: Forward) {
  editing.value = f
  form.value = {
    name: f.name,
    listen: f.listen,
    port: f.port,
    listen_protocol: f.listen_protocol,
    destination: f.destination ?? null,
    tunnel_chain: [...f.tunnel_chain],
  }
  drawer.value = true
}

async function doSave() {
  try {
    const body: Record<string, unknown> = {
      name: form.value.name,
      listen: form.value.listen,
      port: form.value.port,
      listen_protocol: form.value.listen_protocol,
      tunnel_chain: form.value.tunnel_chain,
    }
    if (form.value.destination) body.destination = form.value.destination
    if (editing.value) {
      await fStore.update(editing.value.id, body)
      msg.success('已更新')
    } else {
      await fStore.create(body as Parameters<typeof fStore.create>[0])
      msg.success('已创建')
    }
    drawer.value = false
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doDelete(id: string) {
  try {
    await fStore.remove(id)
    msg.success('已删除')
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doToggle(f: Forward) {
  try {
    await fStore.toggle(f.id)
  } catch (e) {
    msg.error((e as Error).message)
  }
}

const columns: DataTableColumns<Forward> = [
  { title: '名称', key: 'name', width: 130 },
  { title: '监听', key: 'listen', width: 160, render: (r) =>
    h(NSpace, { size: 'small', align: 'center' }, () => [
      h(NTag, { size: 'small', bordered: false, type: 'info' }, () => r.listen_protocol),
      h('span', {}, `${r.listen}:${r.port}`),
    ])
  },
  { title: '目标', key: 'destination', ellipsis: { tooltip: true }, render: (r) =>
    r.destination ? `${r.destination.address}:${r.destination.port}` : '（客户端决定）'
  },
  { title: '隧道链', key: 'tunnel_chain', render: (r) =>
    h(NSpace, { size: 4 }, () =>
      r.tunnel_chain.map((tid) =>
        h(NTag, { size: 'small', bordered: false }, () => tunnelNameMap.value.get(tid) ?? tid.slice(0, 8))
      )
    )
  },
  { title: '启用', key: 'enabled', width: 70, render: (r) =>
    h(NSwitch, { value: r.enabled, onUpdateValue: () => doToggle(r), size: 'small' })
  },
  { title: '操作', key: 'actions', width: 140, render: (r) =>
    h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', onClick: () => openEdit(r) }, () => '编辑'),
      h(NPopconfirm, { onPositiveClick: () => doDelete(r.id) }, {
        trigger: () => h(NButton, { size: 'small', type: 'error' }, () => '删除'),
        default: () => `删除转发 "${r.name}"？`,
      }),
    ])
  },
]

watch(drawer, (open) => {
  if (open) tStore.fetchAll()
})
</script>

<template>
  <NCard title="转发规则">
    <template #header-extra>
      <NButton type="primary" @click="openCreate">新建转发</NButton>
    </template>
    <NDataTable :columns="columns" :data="fStore.forwards" :bordered="false" :loading="fStore.loading" />

    <NDrawer v-model:show="drawer" :width="520">
      <NDrawerContent :title="editing ? '编辑转发' : '新建转发'" closable>
        <NForm label-placement="left" label-width="100">
          <NFormItem label="名称"><NInput v-model:value="form.name" placeholder="如：客户A-HK中转" /></NFormItem>
          <NFormItem label="监听地址"><NInput v-model:value="form.listen" placeholder="0.0.0.0" /></NFormItem>
          <NFormItem label="端口"><NInputNumber v-model:value="form.port" :min="1" :max="65535" style="width: 100%" /></NFormItem>
          <NFormItem label="入站协议"><NSelect v-model:value="form.listen_protocol" :options="protoOptions" /></NFormItem>
          <NFormItem label="目标地址">
            <NSpace vertical style="width: 100%">
              <NSpace>
                <NInput v-model:value="form.destination!.address" placeholder="留空=客户端决定" style="width: 300px" :disabled="!form.destination" />
                <NInputNumber v-model:value="form.destination!.port" :min="1" :max="65535" placeholder="端口" style="width: 120px" :disabled="!form.destination" />
              </NSpace>
              <NSwitch :value="!!form.destination" @update:value="(v: boolean) => { if (v) form.destination = { address: '', port: 443 }; else form.destination = null; }">
                <template #checked>固定目标</template>
                <template #unchecked>客户端决定</template>
              </NSwitch>
            </NSpace>
          </NFormItem>
          <NFormItem label="隧道链">
            <NSelect v-model:value="form.tunnel_chain" :options="tunnelOptions" multiple placeholder="选择隧道（可多选，按顺序链式）" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace>
            <NButton @click="drawer = false">取消</NButton>
            <NButton type="primary" @click="doSave" :disabled="!form.name || !form.port || !form.tunnel_chain.length">保存</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </NCard>
</template>

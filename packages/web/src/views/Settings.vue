<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NCard, NButton, NSpace, NTag, NDescriptions, NDescriptionsItem, NDivider,
  NModal, NForm, NFormItem, NInput, NList, NListItem, NThing, NCode, NAlert,
  NPopconfirm, useMessage,
} from 'naive-ui'
import { useKernelStore } from '@/stores/kernel'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'

const kernel = useKernelStore()
const auth = useAuthStore()
const config = useConfigStore()
const msg = useMessage()
const showPwdModal = ref(false)
const pwdForm = ref({ old: '', new: '' })

const showPreviewModal = ref(false)
const showSnapshotModal = ref(false)
const viewingSnapshot = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([kernel.refresh(), config.loadSnapshots()])
})

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}天${h}时${m}分` : h > 0 ? `${h}时${m}分` : `${m}分`
}

function fmtSnapshotName(name: string): string {
  // 2024-01-15_12-30-45-123Z.json -> 2024-01-15 12:30:45
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/)
  if (!m) return name
  return `${m[1]} ${m[2]}:${m[3]}:${m[4]}`
}

const previewJson = computed(() =>
  config.preview ? JSON.stringify(config.preview.config, null, 2) : '',
)

const snapshotJson = computed(() =>
  config.currentSnapshot ? JSON.stringify(config.currentSnapshot.config, null, 2) : '',
)

async function changePassword() {
  try {
    const { api } = await import('@/api/client')
    await api.post('/api/auth/change-password', pwdForm.value)
    msg.success('密码已修改，请重新登录')
    showPwdModal.value = false
    pwdForm.value = { old: '', new: '' }
    await auth.logout()
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doPreview() {
  try {
    await config.loadPreview()
    showPreviewModal.value = true
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doApply() {
  try {
    const r = await config.apply()
    msg.success(`已应用配置，快照 ${fmtSnapshotName(r.snapshot_name)}`)
    if (r.warnings.length > 0) {
      msg.warning(`警告：${r.warnings.join('; ')}`)
    }
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function viewSnapshot(name: string) {
  viewingSnapshot.value = name
  try {
    await config.loadSnapshot(name)
    showSnapshotModal.value = true
  } catch (e) {
    msg.error((e as Error).message)
  }
}

async function doRollback(name: string) {
  try {
    await config.rollback(name)
    msg.success(`已回滚到 ${fmtSnapshotName(name)}`)
  } catch (e) {
    msg.error((e as Error).message)
  }
}
</script>

<template>
  <NSpace vertical :size="16">
    <NCard title="内核状态">
      <template #header-extra>
        <NSpace>
          <NButton size="small" @click="kernel.refresh()" :loading="kernel.loading">刷新</NButton>
          <NButton size="small" type="success" @click="kernel.start" :disabled="kernel.kernel?.running">启动</NButton>
          <NButton size="small" type="warning" @click="kernel.stop" :disabled="!kernel.kernel?.running">停止</NButton>
          <NButton size="small" @click="kernel.restart" :disabled="!kernel.kernel?.running">重启</NButton>
        </NSpace>
      </template>
      <NDescriptions bordered :column="2">
        <NDescriptionsItem label="状态">
          <NTag :type="kernel.kernel?.running ? 'success' : 'error'" size="small">
            {{ kernel.kernel?.running ? '运行中' : '未运行' }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="版本">{{ kernel.kernel?.version ?? '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="PID">{{ kernel.kernel?.pid ?? '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="控制面">{{ kernel.kernel?.control ? `${kernel.kernel.control.mode} ${kernel.kernel.control.target}` : '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="已安装">{{ kernel.kernel?.installed ? '是' : '否' }}</NDescriptionsItem>
        <NDescriptionsItem label="最后错误">{{ kernel.kernel?.last_error ?? '-' }}</NDescriptionsItem>
      </NDescriptions>
    </NCard>

    <NCard title="配置管理">
      <template #header-extra>
        <NSpace>
          <NButton size="small" @click="doPreview" :loading="config.loading">预览编译</NButton>
          <NPopconfirm @positive-click="doApply">
            <template #trigger>
              <NButton size="small" type="primary" :loading="config.loading">应用并下发</NButton>
            </template>
            将面板模型编译为 Zero 配置并写入磁盘 / 推送内核，是否继续？
          </NPopconfirm>
        </NSpace>
      </template>
      <NAlert type="info" :show-icon="false">
        预览：仅在内存中编译生成 Zero 配置，不落盘、不下发；应用：落盘并尝试通过控制面热重载，同时生成快照。
      </NAlert>
      <NDivider title-placement="left">历史快照（保留最近 50 份）</NDivider>
      <NList v-if="config.snapshots.length > 0" hoverable bordered>
        <NListItem v-for="name in config.snapshots" :key="name">
          <NThing :title="fmtSnapshotName(name)" :description="name" />
          <template #suffix>
            <NSpace>
              <NButton size="tiny" @click="viewSnapshot(name)">查看</NButton>
              <NPopconfirm @positive-click="doRollback(name)">
                <template #trigger>
                  <NButton size="tiny" type="warning">回滚</NButton>
                </template>
                确定要回滚到此快照？将覆盖当前配置。
              </NPopconfirm>
            </NSpace>
          </template>
        </NListItem>
      </NList>
      <NAlert v-else type="default" :show-icon="false">尚无历史快照，应用一次配置即可生成。</NAlert>
    </NCard>

    <NCard title="面板信息">
      <NDescriptions bordered :column="2">
        <NDescriptionsItem label="版本">{{ kernel.info?.panel_version ?? '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="运行时间">{{ kernel.info ? fmtUptime(kernel.info.uptime_ms) : '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Node">{{ kernel.info?.node ?? '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="平台">{{ kernel.info ? `${kernel.info.platform} ${kernel.info.arch}` : '-' }}</NDescriptionsItem>
      </NDescriptions>
    </NCard>

    <NCard title="账户">
      <NSpace>
        <NButton @click="showPwdModal = true">修改密码</NButton>
      </NSpace>
    </NCard>

    <NModal v-model:show="showPwdModal" preset="dialog" title="修改密码" positive-text="确认" negative-text="取消"
      @positive-click="changePassword">
      <NForm label-placement="left" label-width="80">
        <NFormItem label="旧密码"><NInput v-model:value="pwdForm.old" type="password" show-password-on="mousedown" /></NFormItem>
        <NFormItem label="新密码"><NInput v-model:value="pwdForm.new" type="password" show-password-on="mousedown" placeholder="至少8位" /></NFormItem>
      </NForm>
    </NModal>

    <NModal v-model:show="showPreviewModal" preset="card" title="预览编译结果" style="width: 80vw; max-width: 1100px">
      <NSpace vertical>
        <NAlert v-if="config.preview?.errors?.length" type="error">
          {{ config.preview.errors.join('; ') }}
        </NAlert>
        <NAlert v-if="config.preview?.warnings?.length" type="warning">
          {{ config.preview.warnings.join('; ') }}
        </NAlert>
        <NDescriptions bordered :column="2" v-if="config.preview">
          <NDescriptionsItem label="模型哈希">{{ config.preview.model_hash }}</NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <NTag :type="config.preview.errors.length ? 'error' : 'success'" size="small">
              {{ config.preview.errors.length ? '有错误' : '可应用' }}
            </NTag>
          </NDescriptionsItem>
        </NDescriptions>
        <NCode :code="previewJson" language="json" word-wrap />
      </NSpace>
    </NModal>

    <NModal v-model:show="showSnapshotModal" preset="card" :title="`快照：${viewingSnapshot ? fmtSnapshotName(viewingSnapshot) : ''}`" style="width: 80vw; max-width: 1100px">
      <NSpace vertical>
        <NDescriptions bordered :column="2" v-if="config.currentSnapshot">
          <NDescriptionsItem label="应用时间">{{ new Date(config.currentSnapshot.applied_at).toLocaleString() }}</NDescriptionsItem>
          <NDescriptionsItem label="模型哈希">{{ config.currentSnapshot.source_model_hash }}</NDescriptionsItem>
        </NDescriptions>
        <NCode :code="snapshotJson" language="json" word-wrap />
      </NSpace>
    </NModal>
  </NSpace>
</template>

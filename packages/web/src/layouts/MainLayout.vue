<script setup lang="ts">
import { computed, h, type Component } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NIcon,
  NButton,
  NSpace,
  NTag,
} from 'naive-ui'
import {
  SpeedometerOutline,
  CloudDownloadOutline,
  GitNetworkOutline,
  SwapHorizontalOutline,
  StatsChartOutline,
  TerminalOutline,
  SettingsOutline,
  LogOutOutline,
} from '@vicons/ionicons5'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const renderIcon = (icon: Component) => () => h(NIcon, null, { default: () => h(icon) })

const menuOptions = [
  { label: '概览',  key: 'dashboard',     icon: renderIcon(SpeedometerOutline) },
  { label: '订阅',  key: 'subscriptions', icon: renderIcon(CloudDownloadOutline) },
  { label: '隧道',  key: 'tunnels',       icon: renderIcon(GitNetworkOutline) },
  { label: '转发',  key: 'forwards',      icon: renderIcon(SwapHorizontalOutline) },
  { label: '计量',  key: 'stats',         icon: renderIcon(StatsChartOutline) },
  { label: '日志',  key: 'logs',          icon: renderIcon(TerminalOutline) },
  { label: '设置',  key: 'settings',      icon: renderIcon(SettingsOutline) },
]

const activeKey = computed(() => (route.name as string) ?? 'dashboard')

function onSelect(key: string) {
  router.push({ name: key })
}

async function logout() {
  await auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <NLayout has-sider style="height: 100vh">
    <NLayoutSider
      bordered
      :width="220"
      :native-scrollbar="false"
      content-style="padding-top: 12px;"
    >
      <div class="brand">
        <span class="dot" />
        <span class="title">Zero Relay</span>
      </div>
      <NMenu
        :value="activeKey"
        :options="menuOptions"
        :collapsed-width="64"
        :indent="20"
        @update:value="onSelect"
      />
    </NLayoutSider>

    <NLayout>
      <NLayoutHeader bordered class="header">
        <NSpace align="center" justify="space-between" style="width: 100%">
          <div class="header-title">{{ menuOptions.find(o => o.key === activeKey)?.label }}</div>
          <NSpace align="center">
            <NTag :bordered="false" type="success" size="small">内核运行中</NTag>
            <NButton tertiary size="small" @click="logout">
              <template #icon><NIcon><LogOutOutline /></NIcon></template>
              退出
            </NButton>
          </NSpace>
        </NSpace>
      </NLayoutHeader>
      <NLayoutContent content-style="padding: 16px;">
        <RouterView />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px 16px;
  font-weight: 600;
  font-size: 16px;
}
.brand .dot {
  width: 10px; height: 10px; border-radius: 50%; background: #18a058;
  box-shadow: 0 0 8px #18a05844;
}
.header { padding: 0 16px; height: 52px; display: flex; align-items: center; }
.header-title { font-size: 16px; font-weight: 600; }
</style>

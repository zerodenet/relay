<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { NCard, NStatistic, NSpace, NTag, NDescriptions, NDescriptionsItem, NGrid, NGi } from 'naive-ui'
import { useKernelStore } from '@/stores/kernel'
import { useForwardsStore } from '@/stores/forwards'
import { useSubscriptionsStore } from '@/stores/subscriptions'

const kernel = useKernelStore()
const fwd = useForwardsStore()
const sub = useSubscriptionsStore()

onMounted(() => {
  kernel.refresh()
  fwd.fetchAll()
  sub.fetchSubs()
  sub.fetchNodes()
})

const activeFwds = computed(() => fwd.forwards.filter((f) => f.enabled).length)
</script>

<template>
  <NSpace vertical :size="16">
    <NGrid :cols="4" :x-gap="12" :y-gap="12">
      <NGi>
        <NCard><NStatistic label="内核状态">
          <template #default>
            <NTag :type="kernel.kernel?.running ? 'success' : 'error'" size="large">
              {{ kernel.kernel?.running ? '运行中' : '未运行' }}
            </NTag>
          </template>
        </NStatistic></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic label="活跃转发" :value="activeFwds" /></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic label="订阅源" :value="sub.subs.length" /></NCard>
      </NGi>
      <NGi>
        <NCard><NStatistic label="节点池" :value="sub.nodes.length" /></NCard>
      </NGi>
    </NGrid>

    <NCard title="内核信息">
      <NDescriptions bordered :column="3">
        <NDescriptionsItem label="版本">{{ kernel.kernel?.version ?? '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="PID">{{ kernel.kernel?.pid ?? '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="控制面">{{ kernel.kernel?.control ? `${kernel.kernel.control.mode}` : '-' }}</NDescriptionsItem>
      </NDescriptions>
    </NCard>
  </NSpace>
</template>

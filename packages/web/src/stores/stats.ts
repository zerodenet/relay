import { defineStore } from 'pinia'
import { ref } from 'vue'
import { statsApi } from '@/api/stats'
import type { CurrentStats } from '@zero-panel/shared'

export const useStatsStore = defineStore('stats', () => {
  const current = ref<CurrentStats | null>(null)
  const summary = ref<{ bytes_up: number; bytes_down: number; active_conns: number } | null>(null)
  const loading = ref(false)

  async function refresh() {
    loading.value = true
    try {
      const [c, s] = await Promise.all([statsApi.current(), statsApi.summary()])
      current.value = c
      summary.value = s
    } finally {
      loading.value = false
    }
  }

  return { current, summary, loading, refresh }
})

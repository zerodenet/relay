import { defineStore } from 'pinia'
import { ref } from 'vue'
import { forwardApi } from '@/api/forwards'
import type { Forward } from '@zero-panel/shared'

export const useForwardsStore = defineStore('forwards', () => {
  const forwards = ref<Forward[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const data = await forwardApi.list()
      forwards.value = data.items
    } finally {
      loading.value = false
    }
  }

  async function create(body: Partial<Forward> & { name: string; port: number; tunnel_chain: string[] }) {
    await forwardApi.create(body)
    await fetchAll()
  }

  async function update(id: string, body: Partial<Forward>) {
    await forwardApi.update(id, body)
    await fetchAll()
  }

  async function remove(id: string) {
    await forwardApi.delete(id)
    await fetchAll()
  }

  async function toggle(id: string) {
    await forwardApi.toggle(id)
    await fetchAll()
  }

  return { forwards, loading, fetchAll, create, update, remove, toggle }
})

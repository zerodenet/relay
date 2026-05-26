import { defineStore } from 'pinia'
import { ref } from 'vue'
import { tunnelApi } from '@/api/tunnels'
import type { Tunnel } from '@zero-panel/shared'

export const useTunnelsStore = defineStore('tunnels', () => {
  const tunnels = ref<Tunnel[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const data = await tunnelApi.list()
      tunnels.value = data.items
    } finally {
      loading.value = false
    }
  }

  async function create(body: Partial<Tunnel> & { name: string; type: Tunnel['type'] }) {
    await tunnelApi.create(body)
    await fetchAll()
  }

  async function update(id: string, body: Partial<Tunnel>) {
    await tunnelApi.update(id, body)
    await fetchAll()
  }

  async function remove(id: string) {
    await tunnelApi.delete(id)
    await fetchAll()
  }

  return { tunnels, loading, fetchAll, create, update, remove }
})

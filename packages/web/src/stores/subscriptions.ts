import { defineStore } from 'pinia'
import { ref } from 'vue'
import { subscriptionApi, nodeApi } from '@/api/subscriptions'
import type { Subscription, Node } from '@zero-panel/shared'

export const useSubscriptionsStore = defineStore('subscriptions', () => {
  const subs = ref<Subscription[]>([])
  const nodes = ref<Node[]>([])
  const regions = ref<{ region: string; count: number }[]>([])
  const loading = ref(false)

  async function fetchSubs() {
    loading.value = true
    try {
      const data = await subscriptionApi.list()
      subs.value = data.items
    } finally {
      loading.value = false
    }
  }

  async function fetchNodes(params?: Record<string, string>) {
    loading.value = true
    try {
      const data = await nodeApi.list(params)
      nodes.value = data.items
    } finally {
      loading.value = false
    }
  }

  async function fetchRegions() {
    const data = await nodeApi.regions()
    regions.value = data.items
  }

  async function createSub(body: Partial<Subscription>) {
    await subscriptionApi.create(body)
    await fetchSubs()
  }

  async function deleteSub(id: string) {
    await subscriptionApi.delete(id)
    await fetchSubs()
    await fetchNodes()
  }

  async function syncSub(id: string) {
    await subscriptionApi.sync(id)
    await fetchSubs()
    await fetchNodes()
    await fetchRegions()
  }

  async function syncAll() {
    await subscriptionApi.syncAll()
    await fetchSubs()
    await fetchNodes()
    await fetchRegions()
  }

  return { subs, nodes, regions, loading, fetchSubs, fetchNodes, fetchRegions, createSub, deleteSub, syncSub, syncAll }
})

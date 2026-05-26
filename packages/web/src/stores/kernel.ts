import { defineStore } from 'pinia'
import { ref } from 'vue'
import { systemApi } from '@/api/system'

export const useKernelStore = defineStore('kernel', () => {
  const info = ref<Awaited<ReturnType<typeof systemApi.info>> | null>(null)
  const kernel = ref<Awaited<ReturnType<typeof systemApi.kernel>> | null>(null)
  const loading = ref(false)

  async function refresh() {
    loading.value = true
    try {
      const [i, k] = await Promise.all([systemApi.info(), systemApi.kernel()])
      info.value = i
      kernel.value = k
    } finally {
      loading.value = false
    }
  }

  async function start() {
    await systemApi.kernelStart()
    await refresh()
  }

  async function stop() {
    await systemApi.kernelStop()
    await refresh()
  }

  async function restart() {
    await systemApi.kernelRestart()
    await refresh()
  }

  return { info, kernel, loading, refresh, start, stop, restart }
})

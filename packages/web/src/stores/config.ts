import { defineStore } from 'pinia'
import { ref } from 'vue'
import { systemApi, type PreviewResult, type ApplyResult, type SnapshotPayload } from '@/api/system'

export const useConfigStore = defineStore('config', () => {
  const preview = ref<PreviewResult | null>(null)
  const lastApply = ref<ApplyResult | null>(null)
  const snapshots = ref<string[]>([])
  const currentSnapshot = ref<SnapshotPayload | null>(null)
  const loading = ref(false)

  async function loadPreview() {
    loading.value = true
    try {
      preview.value = await systemApi.preview()
    } finally {
      loading.value = false
    }
  }

  async function apply() {
    loading.value = true
    try {
      lastApply.value = await systemApi.apply()
      await loadSnapshots()
      return lastApply.value
    } finally {
      loading.value = false
    }
  }

  async function loadSnapshots() {
    const r = await systemApi.snapshots()
    snapshots.value = r.items
  }

  async function loadSnapshot(name: string) {
    currentSnapshot.value = await systemApi.snapshot(name)
  }

  async function rollback(name: string) {
    return await systemApi.rollback(name)
  }

  return {
    preview,
    lastApply,
    snapshots,
    currentSnapshot,
    loading,
    loadPreview,
    apply,
    loadSnapshots,
    loadSnapshot,
    rollback,
  }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, clearToken, setToken } from '@/api/client'

export const useAuthStore = defineStore('auth', () => {
  const isAuthed = ref<boolean>(!!localStorage.getItem('zp_token'))

  async function login(password: string): Promise<void> {
    const data = await api.post<{ token: string; expires_at: number }>('/api/auth/login', { password })
    setToken(data.token)
    isAuthed.value = true
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // ignore
    }
    clearToken()
    isAuthed.value = false
  }

  return { isAuthed, login, logout }
})

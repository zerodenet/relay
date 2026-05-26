<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const password = ref('')
const loading = ref(false)
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const message = useMessage()

async function submit() {
  if (!password.value) return
  loading.value = true
  try {
    await auth.login(password.value)
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.replace(redirect)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <NCard title="Zero Relay Panel" class="login-card">
      <NForm @submit.prevent="submit">
        <NFormItem label="管理密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="mousedown"
            placeholder="请输入管理密码"
            @keyup.enter="submit"
          />
        </NFormItem>
        <NButton type="primary" block :loading="loading" @click="submit">
          登录
        </NButton>
      </NForm>
    </NCard>
  </div>
</template>

<style scoped>
.login-wrap {
  display: grid;
  place-items: center;
  height: 100vh;
}
.login-card {
  width: 360px;
}
</style>

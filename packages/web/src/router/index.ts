import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      children: [
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/Dashboard.vue') },
        { path: 'subscriptions', name: 'subscriptions', component: () => import('@/views/Subscriptions.vue') },
        { path: 'tunnels', name: 'tunnels', component: () => import('@/views/Tunnels.vue') },
        { path: 'forwards', name: 'forwards', component: () => import('@/views/Forwards.vue') },
        { path: 'stats', name: 'stats', component: () => import('@/views/Stats.vue') },
        { path: 'logs', name: 'logs', component: () => import('@/views/Logs.vue') },
        { path: 'settings', name: 'settings', component: () => import('@/views/Settings.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('zp_token')
  if (!token && to.name !== 'login') return { name: 'login', query: { redirect: to.fullPath } }
  if (token && to.name === 'login') return { name: 'dashboard' }
  return true
})

<script setup lang="ts">
import { authClient } from '~/utils/auth-client'
definePageMeta({ bottomNav: false, contentWidth: 'reading' })
useHead({ title: '设置 · Formula AI' })
const session = useAccountSession()
await session
const { data: account, error, status, refresh } = session
const boundary = useNuxtApp().$accountBoundary
const ownerId = computed(() =>
  status.value === 'success' && !error.value ? account.value?.user?.id : undefined,
)
const busy = ref(false),
  feedback = ref('')
let disposed = false,
  allowExit = false,
  controller: AbortController | undefined
onBeforeRouteLeave(() => {
  if (busy.value && !allowExit) return false
})
onScopeDispose(() => {
  disposed = true
  controller?.abort()
})
async function logout() {
  if (busy.value || !ownerId.value) return
  busy.value = true
  feedback.value = ''
  controller = new AbortController()
  try {
    const result = await authClient.signOut({
      fetchOptions: { signal: controller.signal, retry: 0, timeout: 20000 },
    })
    if (disposed) return
    if (!result.error) boundary.confirmedLogout()
    await refresh()
    if (disposed) return
    if (error.value) {
      feedback.value = result.error
        ? '退出结果未确认，账号状态也暂时无法读取，请重新确认账号。'
        : '退出请求已确认，但账号状态刷新失败，请重新读取。'
      return
    }
    if (account.value?.user) {
      feedback.value = '退出暂时未能确认，账号仍然有效，请重试。'
      return
    }
    boundary.confirmedLogout()
    allowExit = true
    await navigateTo('/profile', { replace: true })
  } catch {
    if (disposed) return
    await refresh()
    if (disposed) return
    if (!error.value && !account.value?.user) {
      boundary.confirmedLogout()
      allowExit = true
      await navigateTo('/profile', { replace: true })
    } else feedback.value = '退出结果尚未确认，请重新读取账号状态后再操作。'
  } finally {
    if (!disposed) busy.value = false
  }
}
</script>
<template>
  <div class="settings-page">
    <PageHeader title="设置" back-to="/profile" />
    <header class="settings-intro">
      <p>你的空间，由你掌握</p>
      <h1>账号与偏好</h1>
    </header>
    <section aria-labelledby="account-heading">
      <div class="section-heading"><h2 id="account-heading">账号</h2></div>
      <div class="card menu-list">
        <div v-if="status === 'pending'" class="status-panel" role="status">正在确认账号…</div>
        <div v-else-if="error" class="status-panel" role="alert">
          <p>账号状态读取失败，私有信息已隐藏。</p>
          <button class="text-button" :disabled="busy" @click="refresh()">重新读取账号</button>
        </div>
        <template v-else-if="account?.user">
          <NuxtLink
            to="/profile/edit"
            class="menu-item account-row"
            :aria-disabled="busy"
            @click="busy && $event.preventDefault()"
          >
            <UserAvatar :user="account.user" :size="44" />
            <div>
              <strong>{{ account.user.name }}</strong>
              <p>{{ account.user.email }}</p>
            </div>
            <AppIcon name="chevron" :size="17" />
          </NuxtLink>
          <button class="menu-item logout" :disabled="busy" @click="logout">
            <AppIcon name="login" :size="20" />
            <span>{{ busy ? '正在确认退出…' : '退出登录' }}</span>
            <AppIcon name="chevron" class="menu-chevron" :size="17" />
          </button>
        </template>
        <NuxtLink v-else to="/login?redirect=/settings" class="menu-item">
          <AppIcon name="login" :size="20" />
          <span>登录你的账号</span>
          <AppIcon name="chevron" class="menu-chevron" :size="17" />
        </NuxtLink>
      </div>
    </section>
    <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
    <template v-if="ownerId">
      <details :key="ownerId + '-usage'" class="card settings-copy section" :inert="busy">
        <summary>账号使用额度</summary>
        <AccountUsage :owner-id="ownerId" />
      </details>
      <ServiceStatus :key="ownerId + '-services'" :owner-id="ownerId" :inert="busy" />
    </template>
  </div>
</template>
<style scoped>
.settings-intro {
  padding: 4px 0 24px;
}
.settings-intro > p {
  color: var(--color-primary);
  font-size: 12px;
  margin-bottom: 8px;
}
.settings-intro h1 {
  font-size: 28px;
}
.settings-copy {
  padding: 22px;
  font-size: 14px;
  line-height: 1.8;
}
.settings-copy .info-note {
  margin: 12px 0;
  color: var(--color-text-secondary);
}
.menu-item {
  min-height: 76px;
}
.account-row > div {
  min-width: 0;
  flex: 1;
}
.account-row strong {
  font-size: 16px;
  overflow-wrap: anywhere;
}
.account-row p {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 6px;
  overflow-wrap: anywhere;
}
.logout {
  color: var(--color-danger);
}
summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
}
.settings-note {
  margin-top: 24px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.reset-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.error-text {
  line-height: 1.8;
}
</style>

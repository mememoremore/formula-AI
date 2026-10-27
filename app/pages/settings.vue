<script setup lang="ts">
import { authClient } from '~/utils/auth-client'
import { createDemoState } from '~/composables/useDemoStore'
definePageMeta({ bottomNav: false })
useHead({ title: '设置 · Formula AI' })
const { data: account, error, refresh } = await useAccountSession()
const store = useDemoStore()
const uploadDraft = useNuxtApp().$uploadDraft
const chatDraft = useNuxtApp().$chatDraft
const { showToast } = useToast()
const showReset = ref(false)
const busy = ref(false)
const feedback = ref('')
async function logout() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await authClient.signOut()
    if (result.error) throw new Error()
    clearNuxtData(
      (key) =>
        key.startsWith('account-') ||
        key.startsWith('saved-formula-') ||
        key.startsWith('draft-') ||
        ['home-recent', 'chat-formula-picker'].includes(key),
    )
    useState<Record<string, string>>('page-origins').value = {}
    uploadDraft.clearAccountState()
    chatDraft.clear()
    await refresh()
    await navigateTo('/profile', { replace: true })
  } catch {
    feedback.value = '退出暂时未能确认，请重试。'
  } finally {
    busy.value = false
  }
}
function reset() {
  store.value = createDemoState()
  showReset.value = false
  showToast('已恢复本机示例。')
}
</script>
<template>
  <PageHeader title="设置" back-to="/profile" />
  <section>
    <div class="section-heading"><h2>账户</h2></div>
    <div class="card menu-list">
      <div v-if="error" class="status-panel" role="alert">
        账号状态读取失败
        <button class="text-button" @click="refresh()">重试</button>
      </div>
      <template v-else-if="account?.user">
        <div class="menu-item">
          <AppIcon name="user" :size="20" />
          <div>
            <span>{{ account.user.name }}</span>
            <p class="info-note">{{ account.user.email }}</p>
          </div>
        </div>
        <button class="menu-item" :disabled="busy" @click="logout">
          <AppIcon name="login" :size="20" />
          <span>{{ busy ? '正在退出…' : '退出登录' }}</span>
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
  <section class="section">
    <div class="section-heading"><h2>本机演示数据</h2></div>
    <div class="card settings-copy">
      <p>本机有 {{ store.formulas.length }} 条演示公式</p>
      <p class="info-note">这些记录仅保存在当前浏览器，恢复示例不影响账号中的公式、收藏或对话。</p>
      <button class="text-button" @click="showReset = true">
        <AppIcon name="history" :size="16" />
        恢复默认示例
      </button>
    </div>
  </section>
  <details v-if="account?.user" class="card settings-copy section">
    <summary>账号使用额度</summary>
    <AccountUsage />
  </details>
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  <ServiceStatus v-if="account?.user" />
  <AppModal :open="showReset" title="恢复默认示例？" @close="showReset = false">
    <p class="prose">这会清除本机新增的演示公式、分类和模拟对话，账号数据不受影响。</p>
    <div class="row section">
      <button class="button button-white" @click="showReset = false">取消</button>
      <button class="button button-primary" @click="reset">确认恢复</button>
    </div>
  </AppModal>
</template>
<style scoped>
.settings-copy {
  padding: 22px;
  font-size: 14px;
  line-height: 1.8;
}
.settings-copy .info-note {
  margin: 12px 0;
}
.menu-item {
  min-height: 76px;
}
summary {
  cursor: pointer;
}
</style>

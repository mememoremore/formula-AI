<script setup lang="ts">
import type { AccountUser } from '#shared/types/account'
definePageMeta({ middleware: 'auth', bottomNav: false, contentWidth: 'reading' })
useHead({ title: '编辑资料 · Formula AI' })
const session = useAccountSession()
await session
const user = shallowRef<AccountUser | null | undefined>(),
  saved = ref(false),
  revision = ref(0)
watch(
  [session.status, session.data],
  ([status, value]) => {
    if (status === 'success') user.value = value?.user ?? null
  },
  { immediate: true },
)
const visible = computed(
  () => session.status.value === 'success' && !session.error.value && !!user.value,
)
const { showToast } = useToast()
async function refresh() {
  await session.refresh()
  if (saved.value && !session.error.value && session.data.value?.user) {
    showToast('资料已保存并同步。')
    saved.value = false
  }
}
async function onSaved() {
  saved.value = true
  await refresh()
}
function expired() {
  session.data.value = undefined
  session.error.value = createError({ statusCode: 401, message: '账号已失效，请重新确认身份。' })
  session.status.value = 'error'
}
async function reload() {
  revision.value++
  await refresh()
}
</script>
<template>
  <div class="profile-edit-page">
    <PageHeader title="编辑资料" back-to="/profile" />
    <p v-if="session.status.value === 'pending'" class="card status-panel" role="status">
      {{ saved ? '资料已保存，正在更新账号显示…' : '正在确认账号…' }}
    </p>
    <div v-else-if="session.error.value" class="card status-panel" role="alert">
      <h2>暂时无法确认账号</h2>
      <p>
        {{
          saved
            ? '保存已经确认，但资料刷新失败，请重新读取。'
            : '私有表单已隐藏，重新确认原账号后可继续本页草稿。'
        }}
      </p>
      <button class="text-button" @click="refresh">重新确认账号</button>
      <NuxtLink to="/login?redirect=/profile/edit" class="text-button">前往登录</NuxtLink>
    </div>
    <div v-else-if="!user" class="status-panel">
      <p>请登录后编辑资料。</p>
      <NuxtLink to="/login?redirect=/profile/edit" class="button button-primary">前往登录</NuxtLink>
    </div>
    <AccountProfileEditor
      v-if="user"
      v-show="visible"
      :key="user.id + ':' + revision"
      :user="user"
      :inert="!visible"
      @saved="onSaved"
      @expired="expired"
      @reload="reload"
    />
  </div>
</template>

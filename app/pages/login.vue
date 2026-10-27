<script setup lang="ts">
import { authClient } from '~/utils/auth-client'
import { authenticationError, accountRedirect } from '~/utils/auth-feedback'
definePageMeta({ bottomNav: false })
useHead({ title: '登录 · Formula AI' })
const route = useRoute(),
  session = useAccountSession(),
  boundary = useNuxtApp().$accountBoundary
await session
const { data: account, error: sessionError, status: sessionStatus } = session
const mode = ref<'login' | 'register'>('login'),
  email = ref(''),
  password = ref(''),
  name = ref(''),
  showPassword = ref(false),
  feedback = ref(''),
  acknowledged = ref(false),
  busy = ref(false),
  composing = ref(false)
const isRegister = computed(() => mode.value === 'register')
let controller: AbortController | undefined,
  disposed = false,
  sequence = 0
onBeforeRouteLeave(() => {
  sequence++
  controller?.abort()
})
onScopeDispose(() => {
  disposed = true
  controller?.abort()
})
function changeMode() {
  if (busy.value || acknowledged.value) return
  mode.value = isRegister.value ? 'login' : 'register'
  password.value = ''
  showPassword.value = false
  feedback.value = ''
}
async function confirmSession(navigate = false) {
  const expected = sequence
  await session.refresh()
  if (disposed || sequence !== expected) return false
  if (session.error.value) {
    feedback.value = acknowledged.value
      ? '认证请求已成功，但账号状态暂时无法读取。请重新确认账号，不要重复注册。'
      : '暂时无法读取账号状态，请重新连接。'
    return false
  }
  if (session.data.value?.user) {
    boundary.clearPrivate()
    if (navigate) await navigateTo(accountRedirect(route.query.redirect), { replace: true })
    return true
  }
  if (acknowledged.value) {
    feedback.value =
      '认证请求已完成，但还未确认登录状态。请确认浏览器允许本站 Cookie 后重新读取账号。'
    return false
  }
  return false
}
async function retrySession() {
  if (busy.value) return
  busy.value = true
  try {
    await confirmSession(acknowledged.value)
  } finally {
    if (!disposed) busy.value = false
  }
}
async function submit() {
  if (
    busy.value ||
    composing.value ||
    acknowledged.value ||
    sessionError.value ||
    sessionStatus.value !== 'success'
  )
    return
  if (!email.value.trim() || !password.value || (isRegister.value && !name.value.trim())) {
    feedback.value = '请填写邮箱、密码和有效昵称。'
    return
  }
  const current = ++sequence,
    active = new AbortController()
  controller = active
  busy.value = true
  feedback.value = ''
  try {
    const credentials = { email: email.value.trim().toLowerCase(), password: password.value }
    const options = { signal: active.signal, retry: 0, timeout: 20000 }
    const result = isRegister.value
      ? await authClient.signUp.email({ ...credentials, name: name.value.trim() }, options)
      : await authClient.signIn.email(credentials, options)
    if (disposed || current !== sequence) return
    if (result.error) {
      feedback.value = authenticationError(result.error.code, result.error.status)
      if (!result.error.status || result.error.status >= 500) await confirmSession(true)
      return
    }
    acknowledged.value = true
    password.value = ''
    boundary.clearPrivate()
    await confirmSession(true)
  } catch {
    if (disposed || current !== sequence) return
    feedback.value = '请求结果尚未确认，正在核对账号状态。'
    const confirmed = await confirmSession(true)
    if (!confirmed && !session.error.value && !acknowledged.value)
      feedback.value = '尚未确认登录，请核对网络后重试。若注册已完成，可切换到登录。'
  } finally {
    if (!disposed && current === sequence) busy.value = false
  }
}
</script>
<template>
  <div class="login-page">
    <PageHeader :title="isRegister ? '创建账号' : '账号登录'" back-to="/profile" />
    <header class="login-intro">
      <span class="soft-icon"><AppIcon name="shield" :size="26" /></span>
      <h1>让思考，有自己的归处</h1>
      <p>公式、收藏与对话，在你的账号中有序保存。</p>
    </header>
    <section v-if="sessionStatus === 'pending' && !busy" class="card status-panel" role="status">
      正在确认账号…
    </section>
    <section v-else-if="account?.user && !sessionError" class="card login-card">
      <h2>欢迎回来，{{ account.user.name }}</h2>
      <p class="info-note">你已登录，可以继续刚才的操作。</p>
      <NuxtLink
        :to="accountRedirect(route.query.redirect)"
        class="button button-primary button-block section"
      >
        继续刚才的操作
      </NuxtLink>
    </section>
    <section v-else class="card login-card">
      <div class="mode-heading">
        <h2>{{ isRegister ? '创建公式空间' : '欢迎回来' }}</h2>
        <span class="badge">{{ isRegister ? '注册' : '登录' }}</span>
      </div>
      <p class="info-note">
        {{ isRegister ? '创建账号，开始积累你的数学灵感。' : '登录后继续你的公式与学习记录。' }}
      </p>
      <div v-if="sessionError || acknowledged" class="status-panel section" role="alert">
        <p>{{ feedback || '账号服务暂时不可用，请重新读取账号状态。' }}</p>
        <button class="text-button" :disabled="busy" @click="retrySession">
          {{ busy ? '正在确认…' : '重新确认账号' }}
        </button>
      </div>
      <form
        class="stack login-fields"
        :aria-busy="busy"
        aria-describedby="login-feedback"
        @submit.prevent="submit"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      >
        <label v-if="isRegister">
          <span class="field-label">昵称</span>
          <input
            v-model="name"
            class="input"
            required
            minlength="1"
            maxlength="100"
            autocomplete="nickname"
            placeholder="希望我们如何称呼你"
            :disabled="busy || acknowledged"
          />
        </label>
        <label>
          <span class="field-label">邮箱</span>
          <input
            v-model="email"
            class="input"
            type="email"
            required
            maxlength="320"
            autocomplete="username"
            inputmode="email"
            autocapitalize="none"
            placeholder="请输入邮箱"
            :disabled="busy || acknowledged"
          />
        </label>
        <label>
          <span class="field-label">密码</span>
          <div class="password-field">
            <input
              v-model="password"
              class="input"
              :type="showPassword ? 'text' : 'password'"
              required
              :minlength="isRegister ? 10 : undefined"
              maxlength="128"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              :placeholder="isRegister ? '至少 10 个字符' : '请输入密码'"
              :disabled="busy || acknowledged"
            />
            <button
              type="button"
              class="icon-button"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              :disabled="busy || acknowledged"
              @click="showPassword = !showPassword"
            >
              <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" />
            </button>
          </div>
        </label>
        <p
          id="login-feedback"
          class="form-feedback"
          :role="feedback && !sessionError && !acknowledged ? 'alert' : undefined"
        >
          {{ !sessionError && !acknowledged ? feedback : '' }}
        </p>
        <button
          class="button button-primary"
          type="submit"
          :disabled="busy || !!sessionError || sessionStatus !== 'success' || acknowledged"
        >
          {{ busy ? '正在确认…' : isRegister ? '创建账号' : '登录' }}
        </button>
      </form>
      <button
        type="button"
        class="switch-mode text-button"
        :disabled="busy || acknowledged"
        @click="changeMode"
      >
        {{ isRegister ? '已有账号？去登录' : '还没有账号？创建一个' }}
      </button>
    </section>
    <NuxtLink to="/" class="button button-secondary button-block guest-button">
      先体验演示版
      <AppIcon name="arrowRight" :size="16" />
    </NuxtLink>
    <p class="info-note login-note">账号与本机演示记录独立，演示内容不会自动导入。</p>
  </div>
</template>
<style scoped>
.login-intro {
  padding: 20px 0 28px;
}
.login-intro h1 {
  font-size: clamp(22px, 5vw, 28px);
  line-height: 1.4;
  margin: 16px 0 10px;
}
.login-intro p {
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.login-card {
  padding: 24px;
  min-width: 0;
}
.mode-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.login-card h2 {
  font-size: 20px;
  overflow-wrap: anywhere;
}
.login-card > .info-note {
  margin-top: 10px;
}
.login-fields {
  margin-top: 24px;
}
.password-field {
  position: relative;
}
.password-field .input {
  padding-right: 54px;
}
.password-field .icon-button {
  position: absolute;
  right: 4px;
  top: 2px;
}
.switch-mode {
  display: flex;
  margin: 12px auto 0;
}
.guest-button {
  margin-top: 20px;
}
.login-note {
  text-align: center;
  margin-top: 20px;
  line-height: 1.8;
}
.form-feedback {
  color: var(--color-danger);
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.form-feedback:empty {
  display: none;
}
.input {
  font-size: 16px;
}
.status-panel {
  text-align: left;
}
</style>

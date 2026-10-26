<script setup lang="ts">
import { authClient } from '~/utils/auth-client'
import { authenticationError, accountRedirect } from '~/utils/auth-feedback'

definePageMeta({ bottomNav: false })
useHead({ title: '登录 · Formula AI' })
const route = useRoute()
const { data: account, error: sessionError, refresh } = await useAccountSession()
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const submitting = ref(false)
const feedback = ref('')
const isRegister = computed(() => mode.value === 'register')
const showPassword = ref(false)

function changeMode() {
  mode.value = isRegister.value ? 'login' : 'register'
  password.value = ''
  showPassword.value = false
  feedback.value = ''
}

async function submit() {
  if (submitting.value) return
  feedback.value = ''
  submitting.value = true
  try {
    const credentials = { email: email.value.trim().toLowerCase(), password: password.value }
    const result = isRegister.value
      ? await authClient.signUp.email({ ...credentials, name: name.value.trim() })
      : await authClient.signIn.email(credentials)
    if (result.error) {
      feedback.value = authenticationError(result.error.code, result.error.status)
      return
    }
    password.value = ''
    clearNuxtData(
      (key) =>
        key.startsWith('account-') ||
        key.startsWith('saved-formula-') ||
        key.startsWith('draft-') ||
        ['home-recent', 'chat-formula-picker'].includes(key),
    )
    await refresh()
    await navigateTo(accountRedirect(route.query.redirect), { replace: true })
  } catch {
    feedback.value = '连接失败，请检查网络后重试。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <PageHeader :title="isRegister ? '创建账号' : '账号登录'" back-to="/profile" />
  <div class="login-brand">
    <PaperArtwork />
    <h2>让每次思考都有迹可循</h2>
    <p>你的公式，值得被好好整理</p>
  </div>
  <div class="card login-card">
    <template v-if="account?.user">
      <h2>欢迎回来，{{ account.user.name }}</h2>
      <p class="info-note">你已登录，可以继续刚才的操作。</p>
      <NuxtLink
        :to="accountRedirect(route.query.redirect)"
        class="button button-primary button-block section"
      >
        继续刚才的操作
      </NuxtLink>
    </template>
    <template v-else>
      <h2>{{ isRegister ? '让公式有自己的归处' : '登录你的公式空间' }}</h2>
      <p class="info-note">
        {{ isRegister ? '创建账号，拥有独立的公式空间。' : '欢迎回来，继续整理你的数学灵感。' }}
      </p>
      <p v-if="sessionError" class="form-feedback" role="status">
        账号服务暂时不可用，请稍后重试。
      </p>
      <form class="stack login-fields" :aria-busy="submitting" @submit.prevent="submit">
        <label v-if="isRegister">
          <span class="field-label">昵称</span>
          <input
            v-model="name"
            class="input"
            required
            minlength="1"
            maxlength="100"
            placeholder="希望我们如何称呼你"
            autocomplete="nickname"
            :disabled="submitting"
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
            placeholder="请输入邮箱"
            autocomplete="username"
            :disabled="submitting"
          />
        </label>
        <label>
          <span class="field-label">密码</span>
          <div class="password-field">
            <input
              class="input"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              :minlength="isRegister ? 10 : undefined"
              maxlength="128"
              :placeholder="isRegister ? '设置密码，至少 10 个字符' : '请输入密码'"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              :disabled="submitting"
            />
            <button
              type="button"
              class="icon-button"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              :disabled="submitting"
              @click="showPassword = !showPassword"
            >
              <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" />
            </button>
          </div>
        </label>
        <p v-if="feedback" class="form-feedback" role="alert">{{ feedback }}</p>
        <button
          class="button button-primary"
          type="submit"
          :disabled="submitting || !!sessionError"
        >
          {{ submitting ? '正在处理…' : isRegister ? '创建账号' : '登录' }}
        </button>
      </form>
      <button type="button" class="switch-mode" :disabled="submitting" @click="changeMode">
        {{ isRegister ? '已有账号？去登录' : '还没有账号？创建一个' }}
      </button>
    </template>
  </div>
  <NuxtLink to="/" class="button button-secondary button-block guest-button">
    先体验演示版
    <AppIcon name="arrowRight" :size="16" />
  </NuxtLink>
  <p class="info-note login-note">
    <AppIcon name="shield" :size="14" />
    账号与本机演示记录独立，演示内容不会自动导入。
  </p>
</template>

<style scoped>
.password-field {
  position: relative;
}
.password-field .input {
  padding-right: 54px;
}
.password-field .icon-button {
  position: absolute;
  right: 5px;
  top: 4px;
  color: var(--color-muted);
}
.login-brand {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 25px 0 32px;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 24px;
  background: linear-gradient(120deg, #6257e5, #8438ed);
  color: #fff;
  margin-bottom: 22px;
}
.login-brand h2 {
  font-size: 22px;
}
.login-brand p {
  font-size: 12px;
  margin-top: 10px;
  color: var(--color-muted);
}
.login-card {
  padding: 24px;
}
.login-card > p {
  margin-top: 8px;
}
.login-fields {
  border: 0;
  padding: 0;
  margin: 24px 0 0;
}
.form-feedback {
  color: var(--color-danger);
  font-size: 12px;
  line-height: 1.7;
  margin-top: 12px;
}
.switch-mode {
  display: block;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  padding: 18px 0 0;
  margin: 0 auto;
}
.guest-button {
  margin-top: 20px;
}
.login-note {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: center;
  margin-top: 22px;
  font-size: 10px;
}
</style>

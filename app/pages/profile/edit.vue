<script setup lang="ts">
import { workspaceFeedback } from '~/utils/workspace-feedback'
definePageMeta({ middleware: 'auth', bottomNav: false })
useHead({ title: '编辑资料 · Formula AI' })
const { data: account, refresh } = await useAccountSession()
const name = ref(account.value?.user?.name ?? '')
const avatar = ref<string | null | undefined>()
const showOptions = ref(false)
const file = shallowRef<File>()
const fileInput = ref<HTMLInputElement>()
const busy = ref(false),
  feedback = ref('')
const dirty = computed(
  () => name.value.trim() !== account.value?.user?.name || avatar.value !== undefined,
)
const { showToast } = useToast()
const previewUser = computed(() => {
  const user = account.value?.user
  return user && avatar.value === null ? { ...user, image: null } : user
})
function restoreDefault() {
  avatar.value = null
  showOptions.value = false
}
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0]
  showOptions.value = false
  input.value = ''
}
function cropped(value: string) {
  avatar.value = value
  file.value = undefined
}
async function save() {
  if (busy.value || !name.value.trim()) return
  busy.value = true
  feedback.value = ''
  try {
    await $fetch('/api/account/profile', {
      method: 'PATCH',
      body: {
        name: name.value.trim(),
        ...(avatar.value === undefined ? {} : { avatar: avatar.value }),
      },
      retry: 0,
      timeout: 25000,
    })
    await refresh()
    avatar.value = undefined
    name.value = account.value?.user?.name ?? name.value
    showToast('资料已保存。')
  } catch (error) {
    feedback.value = workspaceFeedback(error, '保存失败，修改仍然保留，请重试。')
  } finally {
    busy.value = false
  }
}
onBeforeRouteLeave(() => !dirty.value || window.confirm('资料尚未保存，确定离开并放弃修改吗？'))
function unload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', unload))
onScopeDispose(() => {
  if (import.meta.client) window.removeEventListener('beforeunload', unload)
})
</script>
<template>
  <PageHeader title="编辑资料" back-to="/profile" />
  <form class="profile-form" @submit.prevent="save">
    <div class="avatar-editor">
      <button
        type="button"
        class="avatar-button"
        :disabled="busy"
        aria-label="更换头像"
        @click="showOptions = true"
      >
        <UserAvatar :user="previewUser" :preview="avatar || undefined" :size="100" />
        <span><AppIcon name="camera" :size="17" /></span>
      </button>
      <p class="info-note section">点击头像更换图片</p>
    </div>
    <label>
      <span class="field-label">昵称</span>
      <input
        v-model="name"
        class="input"
        maxlength="100"
        required
        autocomplete="nickname"
        :disabled="busy"
        placeholder="希望我们如何称呼你"
      />
    </label>
    <label>
      <span class="field-label">邮箱</span>
      <input class="input readonly" :value="account?.user?.email" readonly />
      <span class="info-note">邮箱用于登录，在此不可修改。</span>
    </label>
    <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
    <button
      class="button button-primary button-block"
      type="submit"
      :disabled="busy || !dirty || !name.trim()"
    >
      {{ busy ? '正在保存…' : '保存资料' }}
    </button>
  </form>
  <input
    ref="fileInput"
    type="file"
    accept="image/jpeg,image/png"
    class="sr-only"
    tabindex="-1"
    aria-label="选择头像图片"
    @change="choose"
  />
  <AppModal :open="showOptions" title="更换头像" sheet @close="showOptions = false">
    <p class="info-note">选择后可裁剪，保存资料后才会更新头像。</p>
    <div class="stack section">
      <button class="button button-white" @click="fileInput?.click()">
        <AppIcon name="image" :size="18" />
        选择图片
      </button>
      <button class="button button-secondary" @click="restoreDefault">恢复默认头像</button>
      <button class="text-button" @click="showOptions = false">取消</button>
    </div>
  </AppModal>
  <AvatarCropper v-if="file" :file="file" @close="file = undefined" @selected="cropped" />
</template>
<style scoped>
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.avatar-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 0 6px;
}
.avatar-button {
  position: relative;
  border: 0;
  padding: 0;
  border-radius: 50%;
  background: transparent;
}
.avatar-button > span:last-child {
  position: absolute;
  right: -2px;
  bottom: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 3px solid #f6f7fc;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
}
.readonly {
  color: #9b94aa;
  background: #f0edf6;
}
</style>

<script setup lang="ts">
import type { AccountUser } from '#shared/types/account'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ user: AccountUser }>()
const emit = defineEmits<{ saved: []; expired: []; reload: [] }>()
const name = ref(props.user.name),
  baseName = ref(props.user.name),
  avatar = ref<string | null | undefined>(),
  showOptions = ref(false),
  file = shallowRef<File>(),
  fileInput = ref<HTMLInputElement>(),
  busy = ref(false),
  feedback = ref('')
const dirty = computed(
  () =>
    !!file.value ||
    name.value.trim() !== baseName.value ||
    (avatar.value === null ? !!props.user.image : avatar.value !== undefined),
)
const previewUser = computed(() =>
  avatar.value === null ? { ...props.user, image: null } : props.user,
)
let disposed = false,
  sequence = 0,
  controller: AbortController | undefined
function canLeave() {
  if (
    (dirty.value || busy.value) &&
    !window.confirm(
      busy.value
        ? '资料正在保存，离开不能撤销已提交的写入。确定离开吗？'
        : '资料尚未保存，确定离开并放弃修改吗？',
    )
  )
    return false
  sequence++
  controller?.abort()
}
onBeforeRouteLeave(canLeave)
function unload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', unload))
onScopeDispose(() => {
  disposed = true
  sequence++
  controller?.abort()
  file.value = undefined
  avatar.value = undefined
  if (import.meta.client) window.removeEventListener('beforeunload', unload)
})
function restoreDefault() {
  if (busy.value) return
  avatar.value = null
  showOptions.value = false
}
function choose(event: Event) {
  if (busy.value) return
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0]
  showOptions.value = false
  input.value = ''
}
function cropped(value: string) {
  avatar.value = value
  file.value = undefined
  feedback.value = ''
}
function reload() {
  if (!dirty.value || window.confirm('重新读取将放弃当前草稿，确定继续吗？')) emit('reload')
}
async function save() {
  if (
    busy.value ||
    file.value ||
    !dirty.value ||
    !name.value.trim() ||
    name.value.trim().length > 100
  )
    return
  const current = ++sequence,
    active = new AbortController(),
    submitted = name.value.trim()
  controller = active
  busy.value = true
  feedback.value = ''
  try {
    await $fetch('/api/account/profile', {
      method: 'PATCH',
      body: { name: submitted, ...(avatar.value === undefined ? {} : { avatar: avatar.value }) },
      signal: active.signal,
      retry: 0,
      timeout: 25000,
    })
    if (disposed || current !== sequence) return
    baseName.value = submitted
    name.value = submitted
    avatar.value = undefined
    emit('saved')
  } catch (error) {
    if (disposed || current !== sequence) return
    feedback.value = workspaceFeedback(
      error,
      '保存结果暂时未能确认，草稿已保留；请先核对最新资料，再决定是否重试。',
    )
    if ([401, 403].includes((error as { statusCode?: number }).statusCode ?? 0)) emit('expired')
  } finally {
    if (!disposed && current === sequence) busy.value = false
  }
}
</script>
<template>
  <div class="profile-editor">
    <form class="profile-form" :aria-busy="busy" @submit.prevent="save">
      <section class="card avatar-editor">
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
        <div>
          <h2>一个头像，认识你</h2>
          <p>选择后可裁剪，保存资料时才会更新。</p>
          <small>JPG / PNG · 最大 10MB · 2000 万像素以内</small>
        </div>
      </section>
      <section class="card fields-card">
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
          <input class="input readonly" :value="user.email" readonly />
          <span class="info-note">邮箱用于登录，在此不可修改。</span>
        </label>
      </section>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <button
        class="button button-primary button-block"
        type="submit"
        :disabled="busy || !dirty || !name.trim()"
      >
        {{ busy ? '正在保存…' : '保存资料' }}
      </button>
      <button v-if="feedback" type="button" class="text-button" :disabled="busy" @click="reload">
        重新读取最新资料
      </button>
      <p class="info-note privacy-note">头像仅在你的账号内展示。新头像保存成功后，才会替换原图。</p>
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
        <button class="button button-white" :disabled="busy" @click="fileInput?.click()">
          <AppIcon name="image" :size="18" />
          选择图片
        </button>
        <button class="button button-secondary" :disabled="busy" @click="restoreDefault">
          恢复默认头像
        </button>
        <button class="text-button" @click="showOptions = false">取消</button>
      </div>
    </AppModal>
    <AvatarCropper v-if="file" :file="file" @close="file = undefined" @selected="cropped" />
  </div>
</template>
<style scoped>
.profile-editor {
  min-width: 0;
}
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.avatar-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 28px 20px;
  text-align: center;
}
.avatar-editor h2 {
  font-size: 18px;
}
.avatar-editor p {
  font-size: 14px;
  margin: 10px 0;
  color: var(--color-text-secondary);
  line-height: 1.8;
}
.avatar-editor small {
  font-size: 12px;
  color: var(--color-text-secondary);
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
  width: 34px;
  height: 34px;
  border: 3px solid var(--color-background);
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
}
.fields-card {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
}
.input {
  font-size: 16px;
}
.readonly {
  color: var(--color-text-secondary);
  background: var(--color-background);
}
.fields-card .info-note {
  display: block;
  margin-top: 10px;
  line-height: 1.8;
}
.privacy-note {
  line-height: 1.8;
  text-align: center;
}
.error-text {
  line-height: 1.8;
  overflow-wrap: anywhere;
}
@media (min-width: 900px) {
  .avatar-editor {
    flex-direction: row;
    text-align: left;
    padding: 28px;
  }
}
</style>

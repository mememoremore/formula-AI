<script setup lang="ts">
import type { AccountCategory } from '#shared/types/library'
import { workspaceFeedback } from '~/utils/workspace-feedback'

defineProps<{ categories: AccountCategory[] }>()

const emit = defineEmits<{ close: [] }>()
const name = ref('')
const editing = ref<AccountCategory | null>(null)
const deleting = ref<AccountCategory | null>(null)
const mutation = useCategoryMutation()
const busy = mutation.busy
const feedback = ref('')
const { showToast } = useToast()

function edit(category: AccountCategory | null) {
  editing.value = category
  deleting.value = null
  name.value = category?.name ?? ''
  feedback.value = ''
}

async function submit() {
  if (busy.value) return
  feedback.value = ''
  try {
    const category = editing.value

    await mutation.execute(
      category
        ? { action: 'rename', id: category.id, name: name.value }
        : { action: 'create', name: name.value },
    )
    edit(null)
    showToast(category ? '分类名称已更新。' : '分类已创建。')
  } catch (error) {
    if (isAccountWriteCancelled(error)) return
    feedback.value = workspaceFeedback(error)
  }
}

function confirmRemoval(category: AccountCategory) {
  deleting.value = category
  feedback.value = ''
}

async function remove() {
  if (!deleting.value || busy.value) return
  feedback.value = ''
  try {
    await mutation.execute({ action: 'delete', id: deleting.value.id })
    edit(null)
    showToast('分类已删除，公式已保留在未分类中。')
  } catch (error) {
    if (isAccountWriteCancelled(error)) return
    feedback.value = workspaceFeedback(error)
  }
}
</script>

<template>
  <AppModal :open="true" title="管理分类" @close="!busy && emit('close')">
    <form class="stack" @submit.prevent="submit">
      <label>
        <span class="field-label">{{ editing ? '修改分类名称' : '新建分类' }}</span>
        <input
          v-model="name"
          class="input"
          placeholder="例如：微积分"
          maxlength="50"
          required
          :disabled="busy || !!deleting"
        />
      </label>
      <div class="manager-actions">
        <button type="submit" class="button button-primary" :disabled="busy || !!deleting">
          {{ busy ? '正在保存…' : editing ? '保存名称' : '创建分类' }}
        </button>
        <button
          v-if="editing"
          type="button"
          class="text-button"
          :disabled="busy"
          @click="edit(null)"
        >
          取消改名
        </button>
      </div>
    </form>
    <div v-if="categories.length" class="manager-list">
      <div v-for="category in categories" :key="category.id" class="manager-row">
        <div>
          <strong>{{ category.name }}</strong>
          <span>{{ category.formulaCount }} 个公式</span>
        </div>
        <button
          type="button"
          class="icon-button"
          :aria-label="`重命名${category.name}`"
          :disabled="busy"
          @click="edit(category)"
        >
          <AppIcon name="pencil" :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          :aria-label="`删除${category.name}`"
          :disabled="busy"
          @click="confirmRemoval(category)"
        >
          <AppIcon name="trash" :size="16" />
        </button>
      </div>
    </div>
    <div v-if="deleting" class="delete-confirm" role="alert">
      <p>删除“{{ deleting.name }}”？其中的公式将移至“未分类”，公式和收藏都会保留。</p>
      <div class="manager-actions">
        <button class="text-button danger" :disabled="busy" @click="remove">确认删除分类</button>
        <button class="text-button" :disabled="busy" @click="deleting = null">取消</button>
      </div>
    </div>
    <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  </AppModal>
</template>

<style scoped>
.manager-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.manager-list {
  max-height: 280px;
  overflow-y: auto;
  margin-top: 20px;
}
.manager-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 9px 0;
  border-top: 1px solid var(--color-border);
}
.manager-row > div {
  flex: 1;
  min-width: 0;
}
.manager-row strong {
  display: block;
  font-size: 12px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.manager-row span {
  color: var(--color-muted);
  font-size: 10px;
}
.manager-row button {
  color: #a194b8;
  flex-shrink: 0;
}
.delete-confirm {
  margin-top: 16px;
  border-radius: 12px;
  background: #fff5f6;
  padding: 14px;
}
.delete-confirm p {
  font-size: 12px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.delete-confirm .manager-actions {
  margin-top: 8px;
}
.danger {
  color: var(--color-danger);
}
</style>

<script setup lang="ts">
defineProps<{ count: number; busy: boolean; available: number }>()
defineEmits<{ remove: []; selectAll: [] }>()
</script>
<template>
  <div class="bulk-selection-bar" aria-label="批量选择操作">
    <span aria-live="polite">
      已选
      <strong>{{ count }}</strong>
      条
    </span>
    <div class="bulk-actions">
      <button
        type="button"
        class="bulk-action bulk-select-all"
        title="全选当前列表（最多100条）"
        :disabled="busy || !available"
        @click="$emit('selectAll')"
      >
        全选
      </button>
      <slot name="actions" />
      <button
        type="button"
        class="bulk-action bulk-delete"
        :disabled="busy || !count"
        @click="$emit('remove')"
      >
        <AppIcon name="trash" :size="16" />
        删除
      </button>
    </div>
  </div>
</template>
<style scoped>
.bulk-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  margin: 0 0 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
  flex-wrap: wrap;
}
.bulk-selection-bar strong {
  color: var(--color-text);
  font-weight: 600;
}
.bulk-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.bulk-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  min-height: 40px;
  border: 0;
  border-radius: 10px;
  font-size: 13px;
}
.bulk-delete {
  background: #fff0f2;
  color: #d73552;
}
.bulk-select-all {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
</style>

<script setup lang="ts">
defineProps<{ title: string; description: string; actionLabel?: string; actionTo?: string }>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon"><AppIcon name="book" :size="28" /></div>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <NuxtLink v-if="actionLabel && actionTo" :to="actionTo" class="button button-secondary">
      {{ actionLabel }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 14px;
  padding: 46px 18px;
  text-align: center;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
p {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.9;
}
</style>

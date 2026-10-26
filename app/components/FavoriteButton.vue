<script setup lang="ts">
defineProps<{ active: boolean; label: string }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="favorite-button"
    :class="{ 'is-active': active }"
    :aria-label="label"
    :aria-pressed="active"
    :title="label"
    @click="$emit('toggle')"
  >
    <AppIcon name="heart" :size="19" />
  </button>
</template>

<style scoped>
.favorite-button {
  display: grid;
  flex: 0 0 44px;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #b7bccb;
  transition: color 180ms ease;
}
.favorite-button :deep(svg) {
  fill: transparent;
  transition:
    fill 180ms ease,
    transform 180ms ease;
}
.favorite-button.is-active {
  color: #8266d6;
}
.favorite-button.is-active :deep(svg) {
  fill: currentColor;
  animation: favorite-pop 260ms ease-out;
}
@media (hover: hover) {
  .favorite-button:hover {
    color: #8266d6;
  }
}
@keyframes favorite-pop {
  0%,
  100% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.16);
  }
}
</style>

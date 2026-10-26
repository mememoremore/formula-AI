<script setup lang="ts">
defineProps<{ src?: string; latex?: string; sample?: boolean }>()
const failed = ref(false)
</script>
<template>
  <span class="formula-thumbnail">
    <img
      v-if="src && !failed"
      :src="src"
      alt="公式原图缩略图"
      loading="lazy"
      @error="failed = true"
    />
    <template v-else-if="sample && latex">
      <MathFormula :latex="latex" :display="false" />
      <small>示例</small>
    </template>
    <AppIcon v-else name="image" :size="22" />
  </span>
</template>
<style scoped>
.formula-thumbnail {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 66px;
  width: 66px;
  height: 58px;
  overflow: hidden;
  border: 1px solid #eae4dd;
  border-radius: 10px;
  color: #aaa0b5;
  background: #f8f4ef;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.formula-thumbnail :deep(.math-inline) {
  font-size: 9px;
  transform: rotate(-6deg);
  overflow: hidden;
  max-width: 95%;
}
small {
  position: absolute;
  bottom: 3px;
  right: 4px;
  font-size: 7px;
  color: #a79a90;
}
</style>

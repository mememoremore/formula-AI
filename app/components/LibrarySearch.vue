<script setup lang="ts">
const model = defineModel<string>({ required: true })
defineEmits<{ search: [] }>()
const id = useId()
</script>
<template>
  <form class="library-search" role="search" @submit.prevent="$emit('search')">
    <button type="submit" aria-label="搜索公式"><AppIcon name="search" :size="21" /></button>
    <label :for="id" class="sr-only">搜索公式名称或内容</label>
    <input :id="id" v-model="model" type="search" placeholder="搜索公式名称或内容" maxlength="200" @search="$emit('search')" />
  </form>
</template>
<style scoped>
.library-search { display:flex; align-items:center; min-height:54px; border:1px solid #dfe1fa; border-radius:22px; background:#ffffffec; padding:4px 16px 4px 10px; }
button { display:grid; place-items:center; width:38px; height:40px; flex-shrink:0; border:0; background:transparent; color:#66658a; border-radius:12px; }
input { width:100%; min-width:0; border:0; background:transparent; color:var(--color-text); padding:10px 6px; font-size:14px; line-height:1.6; }
input:focus { outline:none; }
.library-search:has(input:focus-visible) { box-shadow:0 0 0 2px #a998f338; }
input::placeholder { color:#8e91b3; }
</style>

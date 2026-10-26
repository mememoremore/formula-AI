<script setup lang="ts">
definePageMeta({ middleware: 'auth', bottomNav: false, alias: '/account/conversations/:id' })
useHead({ title: '账号对话 · Formula AI' })
const id = String(useRoute().params.id)
</script>
<template><AccountChat :conversation-id="id" /></template>

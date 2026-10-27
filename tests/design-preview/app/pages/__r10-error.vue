<script setup lang="ts">
const route = useRoute(),
  recovered = ref(false)
onMounted(() => {
  const key = 'r10-error-once-' + String(route.query.code)
  if (route.query.once && sessionStorage.getItem(key)) {
    recovered.value = true
    return
  }
  sessionStorage.setItem(key, '1')
  showError({
    statusCode: Number(route.query.code) || 503,
    message: 'R10_PRIVATE_SQL_password_C:/private/credential.sql',
    fatal: true,
  })
})
</script>
<template>
  <main>
    <h1>{{ recovered ? '页面已恢复' : '正在触发受控错误' }}</h1>
    <NuxtLink to="/about">关于项目</NuxtLink>
  </main>
</template>

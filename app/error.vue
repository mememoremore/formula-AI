<script setup lang="ts">
defineProps<{ error: { statusCode?: number; message?: string } }>()
</script>
<template>
  <div class="error-page">
    <PaperArtwork kind="idea" />
    <h1>{{ error.statusCode === 404 ? '这一页暂时不在这里' : '暂时无法连接服务' }}</h1>
    <p>
      {{
        error.statusCode === 404
          ? '可以检查链接，或回到首页继续探索公式。'
          : '你的访问位置会保留，恢复连接后再试一次。'
      }}
    </p>
    <button
      v-if="error.statusCode !== 404"
      class="button button-primary"
      @click="reloadNuxtApp({ force: true })"
    >
      重新连接当前页面
    </button>
    <button class="text-button" @click="clearError({ redirect: '/' })">返回首页</button>
  </div>
</template>
<style scoped>
.error-page {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 24px;
  min-height: 100dvh;
  padding: 30px;
  text-align: center;
}
h1 {
  font-size: 24px;
}
p {
  font-size: 14px;
  line-height: 1.9;
  color: var(--color-muted);
  max-width: 360px;
}
</style>

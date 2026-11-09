<script setup lang="ts">
import { chatFormulaImages, withoutChatFormulaImages } from '#shared/chat-formula'

const props = defineProps<{ content: string }>()
const images = computed(() => chatFormulaImages(props.content))
</script>
<template>
  <div class="question-content">
    <img
      v-for="(image, index) in images"
      :key="image.id + ':' + index"
      :src="image.src"
      alt="用户上传的公式图片"
      loading="lazy"
    />
    <ChatMessageContent :content="withoutChatFormulaImages(content)" />
  </div>
</template>
<style scoped>
.question-content {
  min-width: 0;
}
img {
  display: block;
  max-width: 100%;
  max-height: 260px;
  object-fit: contain;
  margin-bottom: 10px;
  border-radius: 10px;
  background: white;
}
</style>

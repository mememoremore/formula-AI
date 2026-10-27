<script setup lang="ts">
import { chatSegments } from '~/utils/chat-content'
const props = defineProps<{ content: string }>()
const segments = computed(() => chatSegments(props.content))
</script>
<template>
  <div class="message-content">
    <template v-for="(part, index) in segments" :key="index">
      <MathFormula v-if="part.kind === 'math'" :latex="part.content" :display="part.display" />
      <div v-else-if="part.kind === 'code'" class="code-block">
        <span v-if="part.language" class="code-language">{{ part.language }}</span>
        <pre tabindex="0" aria-label="代码，可横向滚动"><code>{{part.content}}</code></pre>
      </div>
      <ChatText v-else :content="part.content" />
    </template>
  </div>
</template>
<style scoped>
.message-content {
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.message-content :deep(.math-inline) {
  display: inline-block;
  vertical-align: middle;
  padding-block: 0;
  max-width: 100%;
}
.code-block {
  min-width: 0;
  margin: 16px 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}
.code-language {
  display: block;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 12px;
}
pre {
  max-width: 100%;
  overflow: auto;
  padding: 14px;
  white-space: pre;
  overflow-wrap: normal;
  font:
    13px/1.8 Consolas,
    monospace;
}
</style>

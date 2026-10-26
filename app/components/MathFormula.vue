<script setup lang="ts">
import katex from 'katex'

const props = withDefaults(defineProps<{ latex: string; display?: boolean }>(), { display: true })
const rendered = computed(() => {
  try {
    return {
      html: katex.renderToString(props.latex, {
        displayMode: props.display,
        throwOnError: true,
        trust: false,
        strict: 'warn',
        maxExpand: 200,
        maxSize: 20,
        output: 'htmlAndMathml',
      }),
      error: false,
    }
  } catch {
    return { html: '', error: true }
  }
})
</script>

<template>
  <div class="math-formula" :class="{ 'math-inline': !display }">
    <template v-if="rendered.error">
      <code>{{ latex }}</code>
      <p class="error-text">LaTeX 格式暂时无法预览，请检查后修改。</p>
    </template>
    <!-- KaTeX sanitizes its output with trust:false; raw user HTML is never rendered. -->
    <div v-else v-html="rendered.html" />
  </div>
</template>

<style scoped>
.math-formula {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 7px 2px;
  scrollbar-width: thin;
}
.math-formula :deep(.katex-display) {
  margin: 0.5em 0;
}
.math-formula :deep(.katex) {
  font-size: 1.25em;
}
.math-inline :deep(.katex) {
  font-size: 1.08em;
}
code {
  overflow-wrap: anywhere;
  font-size: 12px;
}
</style>

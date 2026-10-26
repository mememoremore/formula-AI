<script setup lang="ts">
const props = defineProps<{ content: string }>()
// 仅识别数学分隔符；其余全部作为Vue文字节点，绝不注入模型HTML。
const segments = computed(() => {
  const pattern =
    /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$])+?(?<!\\)\$/g
  const parts: { content: string; math: boolean; display: boolean }[] = []
  let offset = 0
  for (const match of props.content.matchAll(pattern)) {
    if (match.index > offset)
      parts.push({ content: props.content.slice(offset, match.index), math: false, display: false })
    const value = match[0]
    const display = value.startsWith('$$') || value.startsWith('\\[')
    const trim = value.startsWith('$') && !display ? 1 : 2
    parts.push({ content: value.slice(trim, -trim), math: true, display })
    offset = match.index + value.length
  }
  if (offset < props.content.length)
    parts.push({ content: props.content.slice(offset), math: false, display: false })
  return parts
})
</script>
<template>
  <div class="message-content">
    <template v-for="(part, index) in segments" :key="index">
      <MathFormula v-if="part.math" :latex="part.content" :display="part.display" />
      <ChatText v-else :content="part.content" />
    </template>
  </div>
</template>
<style scoped>
.message-content {
  white-space: pre-wrap;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.message-content :deep(.math-inline) {
  display: inline-block;
  vertical-align: middle;
  padding-block: 0;
}
</style>

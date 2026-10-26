<script setup lang="ts">
const props = defineProps<{ content: string }>()
// 支持模型常用的标题、粗体、行内代码；输出始终是文字节点，禁止执行模型 HTML。
const lines = computed(() =>
  props.content.split('\n').map((line) => ({
    heading: /^#{1,6}\s/.test(line),
    parts: line
      .replace(/^#{1,6}\s+/, '')
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .map((text) => ({
        kind:
          text.startsWith('**') && text.endsWith('**')
            ? 'strong'
            : text.startsWith('`') && text.endsWith('`')
              ? 'code'
              : 'text',
        value:
          text.startsWith('**') && text.endsWith('**')
            ? text.slice(2, -2)
            : text.startsWith('`') && text.endsWith('`')
              ? text.slice(1, -1)
              : text,
      })),
  })),
)
</script>
<template>
  <template v-for="(line, index) in lines" :key="index">
    <strong v-if="line.heading" class="text-heading">
      <template v-for="(part, i) in line.parts" :key="i">{{ part.value }}</template>
    </strong>
    <template v-else>
      <template v-for="(part, i) in line.parts" :key="i">
        <strong v-if="part.kind === 'strong'">{{ part.value }}</strong>
        <code v-else-if="part.kind === 'code'">{{ part.value }}</code>
        <span v-else>{{ part.value }}</span>
      </template>
    </template>
    <br v-if="index < lines.length - 1" />
  </template>
</template>
<style scoped>
.text-heading {
  font-size: 1.04em;
  font-weight: 650;
}
code {
  padding: 2px 5px;
  border-radius: 5px;
  background: #ede9f5;
  color: #695184;
  font:
    0.88em/1.6 Consolas,
    monospace;
}
</style>

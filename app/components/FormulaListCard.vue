<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    latex: string
    to: string
    category?: string
    favorite: boolean
    createdAt: string
    imageSrc?: string
    sourceLabel?: string
    sample?: boolean
    busy?: boolean
    editableCategory?: boolean
    compact?: boolean
  }>(),
  { category: '未分类', sourceLabel: '已保存公式' },
)
const emit = defineEmits<{ favorite: []; category: [] }>()
function date(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
</script>
<template>
  <article class="card formula-list-card" :class="{ compact }">
    <div class="formula-card-heading">
      <button
        v-if="editableCategory"
        class="category-tag"
        :aria-label="'修改' + title + '的分类'"
        @click="emit('category')"
      >
        {{ category }}
        <AppIcon name="pencil" :size="11" />
      </button>
      <span v-else class="category-tag">{{ category }}</span>
      <FavoriteButton
        :active="favorite"
        :label="(favorite ? '取消收藏' : '收藏') + title"
        :disabled="busy"
        @toggle="emit('favorite')"
      />
    </div>
    <NuxtLink :to="to" :aria-label="'查看' + title" class="formula-card-body">
      <h3>{{ title }}</h3>
      <MathFormula class="card-latex" :latex="latex" />
      <div class="formula-card-meta">
        <FormulaThumbnail :src="imageSrc" :latex="latex" :sample="sample" />
        <div>
          <p>{{ sourceLabel }}</p>
          <time :datetime="createdAt">{{ date(createdAt) }}</time>
        </div>
        <AppIcon name="chevron" :size="17" />
      </div>
    </NuxtLink>
  </article>
</template>
<style scoped>
.formula-list-card {
  padding: 15px 20px 22px;
  border: 1px solid #eeebf4;
}
.formula-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 3px;
}
.category-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 80%;
  padding: 7px 12px;
  border: 0;
  border-radius: 9px;
  background: #efeaff;
  color: #8c71be;
  font-size: 11px;
  overflow-wrap: anywhere;
}
h3 {
  font-size: 15px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.formula-card-body {
  display: block;
  min-width: 0;
}
.formula-card-body :deep(.card-latex) {
  padding: 20px 0 24px;
}
.formula-card-body :deep(.katex-display) {
  margin: 0;
}
.formula-card-meta {
  display: flex;
  align-items: center;
  gap: 13px;
}
.formula-card-meta > div {
  flex: 1;
  min-width: 0;
}
.formula-card-meta p,
time {
  font-size: 11px;
  line-height: 1.8;
  color: #9a92a8;
}
time {
  display: block;
  margin-top: 4px;
}
.formula-card-meta > svg {
  color: #9c8eb6;
}
.compact {
  padding: 14px 18px;
}
.compact .formula-card-meta {
  display: none;
}
.compact .formula-card-body :deep(.card-latex) {
  padding-block: 12px;
}
</style>

<script setup lang="ts">
definePageMeta({ bottomNav: false })
useHead({ title: '关于项目 · Formula AI' })
</script>
<template>
  <PageHeader title="关于项目" back-to="/profile" />
  <section class="about-hero">
    <AppBrand :avatar="false" />
    <h2>从识别，到理解</h2>
    <PaperArtwork />
  </section>
  <div class="stack">
    <article class="about-feature">
      <span class="soft-icon"><AppIcon name="image" :size="23" /></span>
      <div>
        <h2>图片识别</h2>
        <p>让手写与印刷的公式，成为清晰可编辑的内容。</p>
      </div>
    </article>
    <article class="about-feature">
      <span class="soft-icon"><AppIcon name="book" :size="23" /></span>
      <div>
        <h2>公式整理</h2>
        <p>通过分类、收藏与版本记录，把灵感留在手边。</p>
      </div>
    </article>
    <article class="about-feature">
      <span class="soft-icon"><AppIcon name="sparkles" :size="23" /></span>
      <div>
        <h2>AI 对话</h2>
        <p>围绕公式连续提问，理清符号、推导和计算思路。</p>
      </div>
    </article>
  </div>
  <p class="page-footnote">把每一次思考，整理成知识</p>
</template>
<style scoped>
.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 0;
}
.about-hero :deep(.app-brand) {
  margin-bottom: 22px;
}
h2 {
  font-size: 25px;
  margin-bottom: 24px;
}
.about-feature {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 18px 2px;
}
h2 {
  font-size: 16px;
}
p {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--color-muted);
}
</style>

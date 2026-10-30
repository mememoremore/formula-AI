<script setup lang="ts">
definePageMeta({ bottomNav: false, contentWidth: 'reading' })
useHead({ title: '关于项目 · Formula AI' })
</script>
<template>
  <PageHeader title="关于项目" back-to="/profile" />
  <section class="about-hero">
    <AppBrand :avatar="false" />
    <span class="eyebrow">写下灵感，读懂公式</span>
    <h2 class="about-title">从识别，到理解</h2>
    <p class="about-description">
      把公式图片或手动输入的 LaTeX，整理成可以回顾、校正与继续探索的知识。
    </p>
    <PaperArtwork />
  </section>
  <div class="stack">
    <article class="about-feature">
      <span class="soft-icon"><AppIcon name="image" :size="23" /></span>
      <div>
        <h2>图片识别</h2>
        <p>自由裁剪图片后识别，也可直接输入 LaTeX，实时预览并保存。</p>
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
        <h2>理解与追问</h2>
        <p>用 AI 结构化解释梳理符号、条件和推导；也可自由提问、查看解释历史并继续追问。</p>
      </div>
    </article>
    <article class="about-feature">
      <span class="soft-icon"><AppIcon name="book" :size="23" /></span>
      <div>
        <h2>带进文档</h2>
        <p>复制 LaTeX 或完整解释，也可选择固定版本下载可编辑 DOCX。</p>
      </div>
    </article>
  </div>
  <NuxtLink to="/help" class="button button-secondary button-block section">
    了解使用方式
    <AppIcon name="arrowRight" :size="16" />
  </NuxtLink>
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
.about-title {
  font-size: clamp(26px, 6vw, 34px);
  margin: 12px 0;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--color-primary);
}
.about-description {
  max-width: 360px;
  margin: 0 0 24px;
}
.about-feature {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 12px 2px;
}
.about-feature h2 {
  font-size: 16px;
}
p {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--color-muted);
}
.about-feature {
  border-bottom: 1px solid var(--color-border);
}
</style>

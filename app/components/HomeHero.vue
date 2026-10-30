<script setup lang="ts">
defineProps<{ cameraTo: string; uploadTo: string }>()
</script>
<template>
  <section class="home-hero" aria-labelledby="home-title">
    <div class="hero-copy">
      <p class="hero-kicker">随手记录 · 慢慢理解</p>
      <h1 id="home-title">
        写下灵感，
        <br />
        <em>读懂公式。</em>
      </h1>
      <p class="hero-description">
        从手写的疑问，
        <br />
        到清晰的答案。也可直接输入 LaTeX，保存后让 AI 帮你理解。
      </p>
      <svg class="ink-stroke" viewBox="0 0 150 40" aria-hidden="true">
        <path
          d="M5 35Q70 -2 145 5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </div>
    <img
      class="hero-art"
      src="/images/home-paper.svg"
      alt=""
      aria-hidden="true"
      width="300"
      height="330"
      fetchpriority="high"
    />
  </section>
  <div class="stack home-actions" aria-label="创建公式">
    <NuxtLink :to="cameraTo" class="button button-primary home-action">
      <AppIcon name="camera" :size="26" />
      <span>
        <strong>识别公式</strong>
        <small>拍下公式，开始理解</small>
      </span>
      <AppIcon name="chevron" :size="18" class="action-arrow" />
    </NuxtLink>
    <NuxtLink :to="uploadTo" class="button button-white home-action">
      <AppIcon name="image" :size="25" />
      <span>
        <strong>上传图片</strong>
        <small>从相册选一张清晰图片</small>
      </span>
      <AppIcon name="chevron" :size="18" class="action-arrow" />
    </NuxtLink>
    <NuxtLink to="/formulas/new" class="button button-white home-action">
      <AppIcon name="pencil" :size="25" />
      <span>
        <strong>输入 LaTeX</strong>
        <small>实时预览，保存到账号公式库</small>
      </span>
      <AppIcon name="chevron" :size="18" class="action-arrow" />
    </NuxtLink>
  </div>
</template>
<style scoped>
.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  align-items: center;
  gap: 8px;
  margin: 4px 0 24px;
  min-height: 250px;
}
.hero-copy {
  min-width: 0;
  position: relative;
  z-index: 1;
}
.hero-kicker {
  color: var(--color-primary);
  font-size: 11px;
  letter-spacing: 1px;
  margin-bottom: 14px;
}
h1 {
  font-size: clamp(30px, 8.5vw, 38px);
  line-height: 1.5;
  letter-spacing: -1.5px;
}
em {
  color: var(--color-primary);
  font-style: normal;
}
.hero-description {
  margin-top: 18px;
  font-size: 14px;
  line-height: 1.9;
  color: var(--color-text-secondary);
  letter-spacing: 1px;
}
.ink-stroke {
  display: block;
  width: min(120px, 100%);
  height: 30px;
  color: var(--color-primary);
  opacity: 0.55;
}
.hero-art {
  display: block;
  width: 100%;
  max-width: 230px;
  height: auto;
  justify-self: end;
}
.home-actions {
  gap: 12px;
}
.home-action {
  justify-content: flex-start;
  gap: 14px;
  padding: 15px 20px;
  min-height: 72px;
  text-align: left;
}
.home-action span {
  min-width: 0;
}
.home-action strong {
  display: block;
  font-weight: 600;
  font-size: 17px;
  line-height: 1.5;
}
.home-action small {
  display: block;
  font-size: 11px;
  line-height: 1.8;
}
.button-primary {
  background: linear-gradient(115deg, var(--color-primary), var(--color-primary-hover));
}
.button-white small {
  color: var(--color-text-secondary);
}
.action-arrow {
  margin-left: auto;
  flex-shrink: 0;
}
@media (max-width: 360px) {
  .home-hero {
    min-height: 230px;
  }
  .hero-kicker {
    letter-spacing: 0;
    font-size: 10px;
  }
  .home-action {
    padding-inline: 16px;
  }
}
</style>

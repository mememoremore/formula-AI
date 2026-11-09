<script setup lang="ts">
defineProps<{ cameraTo: string; uploadTo: string }>()
</script>
<template>
  <section class="home-hero" aria-labelledby="home-title">
    <div class="hero-copy">
      <h1 id="home-title">
        写下灵感，
        <br />
        <em>读懂公式。</em>
      </h1>
      <p class="hero-description">拍照/图片识别、输入公式，让每个公式都能被读懂</p>
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
    <NuxtLink :to="cameraTo" class="button button-white home-action">
      <AppIcon name="camera" :size="26" />
      <span>
        <strong>拍照上传</strong>
        <small>拍下公式，开始理解</small>
      </span>
      <AppIcon name="chevron" :size="18" class="action-arrow" />
    </NuxtLink>
    <NuxtLink :to="uploadTo" class="button button-white home-action">
      <AppIcon name="image" :size="25" />
      <span>
        <strong>图片上传</strong>
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
    <NuxtLink to="/batches" class="button button-white home-action">
      <AppIcon name="imagePlus" :size="25" />
      <span>
        <strong>批量处理</strong>
        <small>多张单公式或多张多公式，分批识别</small>
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
  margin: 0 0 16px;
  min-height: 150px;
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
  font-size: min(clamp(30px, 8.5vw, 38px), var(--page-title-font-size, 24px));
  line-height: 1.5;
  letter-spacing: -1.5px;
}
em {
  color: var(--color-primary);
  font-style: normal;
}
.hero-description {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  letter-spacing: 0;
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
  padding: 12px 16px;
  min-height: 60px;
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
.button-white small {
  color: var(--color-text-secondary);
}
.home-action {
  transition:
    background 150ms ease,
    color 150ms ease;
}
@media (hover: hover) {
  .home-action:hover {
    background: var(--gradient-primary);
    color: white;
    border-color: transparent;
  }
  .home-action:hover small {
    color: inherit;
  }
}
.home-action:focus-visible {
  background: var(--gradient-primary);
  color: white;
}
.home-action:focus-visible small {
  color: inherit;
}
.action-arrow {
  margin-left: auto;
  flex-shrink: 0;
}
@media (max-width: 360px) {
  .home-hero {
    min-height: 140px;
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

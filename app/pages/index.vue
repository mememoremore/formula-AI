<script setup lang="ts">
import type { FormulaLibraryPage } from '#shared/types/library'
import type { ConversationPage } from '#shared/types/tasks'
const { data: account, error: sessionError, demo } = useWorkspace()
await useAccountSession()
const request = useRequestFetch()
const { formulas } = useDemoLibrary()
const demoStore = useDemoStore()
const { preview } = useUploadPreview()
const { data: recent, error, refresh } = await useAsyncData('home-recent', async () => {
  if (!account.value?.user || demo.value) return { formulas: [], conversation: undefined }
  const [library, conversations] = await Promise.all([
    request<FormulaLibraryPage>('/api/account/library'),
    request<ConversationPage>('/api/account/conversations'),
  ])
  return { formulas: library.items.slice(0, 1), conversation: conversations.items[0] }
}, { watch: [() => account.value?.user?.id, demo] })
const demoFormula = computed(() => formulas.value[0])
const demoConversation = computed(() => {
  const entry = Object.entries(demoStore.value.chats).find(([, messages]) => messages.length > 0)
  if (!entry) return undefined
  const formula = formulas.value.find(item => entry[0] === `version:${item.versionId}`)
  return {
    title: formula?.title ?? '自由提问',
    subtitle: entry[1].filter(message => message.role === 'user').at(-1)?.content ?? '继续上次的思考',
    latex: formula?.latex,
    to: formula ? `/ai/new?space=demo&formulaId=${formula.id}` : '/ai/new?space=demo',
  }
})
</script>
<template>
  <AppBrand tagline />
  <section class="home-hero">
    <div class="hero-copy">
      <h1>写下灵感，<br /><em>读懂公式。</em></h1>
      <p>从手写的疑问，<br />到清晰的答案。</p>
      <svg class="ink-stroke" viewBox="0 0 150 40" aria-hidden="true"><path d="M5 35Q70 -2 145 5" fill="none" stroke="#a28bff" stroke-width="1.8" stroke-linecap="round" /></svg>
    </div>
    <img class="hero-art" src="/images/home-paper.webp" alt="" aria-hidden="true" fetchpriority="high" />
  </section>
  <div class="stack home-actions">
    <NuxtLink to="/upload?source=camera" class="button button-primary"><AppIcon name="camera" :size="29" />识别公式</NuxtLink>
    <NuxtLink to="/upload" class="button button-white"><AppIcon name="image" :size="27" />上传图片</NuxtLink>
  </div>
  <div v-if="sessionError || error" class="card status-panel section" role="alert">
    <p>最近记录暂时无法读取。</p><button class="text-button" @click="refresh()">重新加载</button>
  </div>
  <div v-else class="stack home-recents">
    <RecentEntryCard v-if="recent?.conversation" label="继续上次对话" :title="recent.conversation.title" :subtitle="recent.conversation.preview || '接着上次的思路，继续提问'" :latex="recent.conversation.latex ?? undefined" :to="'/ai/' + recent.conversation.id" />
    <RecentEntryCard v-else-if="demo && demoConversation" label="继续上次对话" v-bind="demoConversation" sample />
    <RecentEntryCard v-else-if="demo && demoFormula" label="公式对话" title="从一个公式开始思考" subtitle="选一个示例，试着问问为什么" :latex="demoFormula.latex" :to="'/ai/new?space=demo&formulaId=' + demoFormula.id" sample />
    <RecentEntryCard v-for="formula in recent?.formulas ?? []" :key="formula.id" label="最近公式" :title="formula.title" subtitle="回顾识别结果与思考" :latex="formula.latex" :to="'/formulas/' + formula.id" :image-src="formula.imageId ? '/api/account/files/' + formula.imageId + '/content' : undefined" />
    <RecentEntryCard v-if="demo && demoFormula" label="最近公式" :title="demoFormula.title" subtitle="本机预置公式示例" :latex="demoFormula.latex" :to="'/result/' + demoFormula.id" :image-src="preview?.formulaId === demoFormula.id ? preview.url : undefined" sample />
    <EmptyState v-if="!demo && !recent?.formulas.length" title="等待你的第一笔" description="上传一张清晰的公式图片，开始整理思考。" action-label="去识别" action-to="/upload" />
  </div>
  <p v-if="demo" class="home-note">本机演示 · 登录后可保存真实识别记录</p>
</template>
<style scoped>
.home-hero { position: relative; min-height: 270px; margin: -8px -12px 20px 0; isolation: isolate; }
.hero-copy { position: relative; z-index: 1; padding-top: 15px; pointer-events: none; }
h1 { font-size: 38px; line-height: 1.4; letter-spacing: -1.5px; }
em { color: var(--color-primary); font-style: normal; }
.hero-copy p { font-size: 17px; line-height: 1.9; margin-top: 29px; color: #777caa; letter-spacing: 2.5px; transform: rotate(-7deg); transform-origin: left; }
.ink-stroke { width: 137px; height: 36px; margin: 1px 0 0 18px; }
.hero-art { position: absolute; width: 265px; height: 290px; object-fit: contain; top: -19px; right: -20px; z-index: 0; pointer-events: none; }
.home-actions { gap: 12px; }
.home-actions .button { min-height: 62px; font-size: 20px; gap: 15px; border-radius: 16px; }
.home-actions .button-primary { background: linear-gradient(115deg,#8a60ff,#603aff); }
.home-actions .button-white { background: #ffffff85; border-color: #dfe2ff; box-shadow: 0 3px 10px #6359db06; }
.home-recents { margin-top: 24px; gap: 12px; }
.home-note { margin: 20px 0 0; color: #9596ac; font-size: 11px; text-align: center; line-height: 1.7; }
@media (max-width: 390px) {
  .home-hero { min-height: 238px; }
  h1 { font-size: 32px; }
  .hero-copy p { font-size: 15px; margin-top: 25px; }
  .hero-art { width: 216px; height: 252px; right: -21px; top: -8px; }
  .home-actions .button { min-height: 58px; font-size: 18px; }
}
</style>

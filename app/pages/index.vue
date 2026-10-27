<script setup lang="ts">
const workspace = useWorkspace()
await useAccountSession()
const home = useHomeOverview(workspace)
const { demo, recent, demoFormula, demoConversation, preview, loading } = home
const { error: sessionError, status: sessionStatus } = home.session
await home.request
</script>
<template>
  <div class="home-brand">
    <AppBrand tagline :account-user="home.session.data.value?.user ?? null" />
  </div>
  <HomeHero :camera-to="home.cameraTo.value" :upload-to="home.uploadTo.value" />
  <section class="home-recents" aria-labelledby="home-recents-title" :aria-busy="loading">
    <div class="section-heading">
      <div>
        <p class="section-kicker">留住思考的轨迹</p>
        <h2 id="home-recents-title">继续探索</h2>
      </div>
      <NuxtLink :to="home.libraryTo.value" class="text-button">
        公式库
        <AppIcon name="arrowRight" :size="14" />
      </NuxtLink>
    </div>
    <div v-if="sessionError" class="card status-panel home-feedback" role="alert">
      <h3>账号状态暂时无法确认</h3>
      <p>请重新连接后读取记录；这里不会自动切换为演示数据。</p>
      <button
        class="text-button"
        :disabled="sessionStatus === 'pending'"
        @click="home.retrySession"
      >
        重新连接账号
      </button>
    </div>
    <div v-else-if="loading" class="stack home-loading" role="status" aria-label="正在读取首页记录">
      <div v-for="index in 2" :key="index" class="card loading-card" aria-hidden="true">
        <div class="skeleton" />
        <div class="skeleton" />
        <div class="skeleton" />
      </div>
      <span class="sr-only">正在读取你的记录</span>
    </div>
    <div v-else class="stack home-records">
      <div
        v-if="recent.failed.length || home.request.error.value"
        class="card status-panel home-feedback"
        role="alert"
      >
        <h3>{{ recent.failed.length === 1 ? '部分记录暂时未能读取' : '最近记录暂时未能读取' }}</h3>
        <p>
          {{ recent.failed.includes('formulas') ? '公式记录暂不可用。' : ''
          }}{{ recent.failed.includes('conversations') ? '对话记录暂不可用。' : '' }}
          已读取的内容仍可打开。
        </p>
        <button class="text-button" @click="home.retryRecent">重试最近记录</button>
      </div>
      <RecentEntryCard
        v-if="!demo && recent.conversation"
        label="最近创建的对话"
        :title="recent.conversation.title"
        :subtitle="recent.conversation.preview || '接着已有的思路，继续提问'"
        :latex="recent.conversation.latex ?? undefined"
        :to="'/ai/' + recent.conversation.id"
      />
      <RecentEntryCard
        v-else-if="demo && demoConversation"
        label="继续本机对话"
        v-bind="demoConversation"
        sample
      />
      <RecentEntryCard
        v-else-if="demo && demoFormula"
        label="试着问问为什么"
        title="从一个公式开始思考"
        subtitle="体验公式解释与连续提问"
        :latex="demoFormula.latex"
        :to="'/ai/new?space=demo&formulaId=' + demoFormula.id"
        sample
      />
      <RecentEntryCard
        v-for="formula in recent.formulas"
        :key="formula.id"
        label="最近保存的公式"
        :title="formula.title"
        subtitle="打开公式，回顾与校正"
        :latex="formula.latex"
        :to="'/formulas/' + formula.id"
        :image-src="
          formula.imageId ? '/api/account/files/' + formula.imageId + '/content' : undefined
        "
      />
      <RecentEntryCard
        v-if="demo && demoFormula"
        :label="demoFormula.source === 'demo' ? '示例公式' : '本机公式'"
        :title="demoFormula.title"
        :subtitle="
          demoFormula.source === 'demo'
            ? '本机预置示例 · 并非真实识别结果'
            : '本次演示识别，仅保存在浏览器'
        "
        :latex="demoFormula.latex"
        :to="'/result/' + demoFormula.id"
        :image-src="preview?.formulaId === demoFormula.id ? preview.url : undefined"
        sample
      />
      <div
        v-if="
          !recent.failed.length &&
          !home.request.error.value &&
          !recent.formulas.length &&
          (!demo || !demoFormula)
        "
        class="card"
      >
        <EmptyState
          title="等待你的第一笔"
          description="上传一张清晰的公式图片，把新的思考留在这里。"
          action-label="去识别"
          :action-to="home.uploadTo.value"
        />
      </div>
    </div>
  </section>
  <p v-if="demo && !sessionError" class="home-note">本机演示 · 登录后可保存真实识别记录</p>
</template>
<style scoped>
.home-brand :deep(a) {
  min-height: var(--control-hit-area);
}
.home-brand :deep(a[aria-label='查看我的资料']) {
  display: grid;
  place-items: center;
  min-width: var(--control-hit-area);
}
.home-recents {
  margin-top: 32px;
}
.section-heading {
  align-items: flex-end;
}
.section-heading h2 {
  font-size: 19px;
}
.section-kicker {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 3px;
}
.home-records {
  gap: 16px;
}
.home-feedback {
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  padding: 20px;
}
.home-feedback h3 {
  color: var(--color-text);
  margin-bottom: 6px;
}
.loading-card {
  padding: 24px;
  display: grid;
  gap: 16px;
  min-height: 150px;
}
.loading-card .skeleton:first-child {
  width: 40%;
}
.loading-card .skeleton:last-child {
  width: 65%;
}
.home-note {
  margin: 24px 0 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: center;
  line-height: 1.8;
}
</style>

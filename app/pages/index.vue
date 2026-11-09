<script setup lang="ts">
import { recognitionHistoryTitle, recognitionResultPresentation } from '#shared/recognition-result'

const workspace = useWorkspace()

await useAccountSession()

const home = useHomeOverview(workspace)
const { demo, recent, demoFormula, preview, loading } = home
const labels = { QUEUED: '排队中', PROCESSING: '识别中', COMPLETED: '已完成', FAILED: '识别失败' }
const { error: sessionError, status: sessionStatus } = home.session

await home.request
</script>
<template>
  <div class="home-brand">
    <AppBrand :account-user="home.session.data.value?.user ?? null" />
  </div>
  <HomeHero :camera-to="home.cameraTo.value" :upload-to="home.uploadTo.value" />
  <PersonalizedRecommendations
    v-if="!demo && home.session.data.value?.user"
    :key="home.session.data.value.user.id"
    :owner-id="home.session.data.value.user.id"
  />
  <section class="home-recents" aria-labelledby="home-recents-title" :aria-busy="loading">
    <div class="section-heading">
      <div>
        <h2 id="home-recents-title">最近识别</h2>
      </div>
      <NuxtLink :to="demo ? '/library?space=demo' : '/library?view=recent'" class="text-button">
        全部记录
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
        v-if="recent.failed || home.request.error.value"
        class="card status-panel home-feedback"
        role="alert"
      >
        <h3>最近识别暂时未能读取</h3>
        <p>请重试，已有识别记录仍保存在账号中。</p>
        <button class="text-button" @click="home.retryRecent">重试最近记录</button>
      </div>
      <RecentEntryCard
        v-for="item in recent.recognitions"
        :key="item.id"
        :title="recognitionHistoryTitle(item)"
        :subtitle="
          item.createdAt.slice(0, 10) +
          ' · ' +
          (recognitionResultPresentation(item)?.label || labels[item.status])
        "
        formula
        :latex="item.latex ?? undefined"
        :to="
          item.formulaId && item.status === 'COMPLETED'
            ? '/formulas/' + item.formulaId
            : '/recognitions/' + item.id
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
          !recent.failed &&
          !home.request.error.value &&
          !recent.recognitions.length &&
          (!demo || !demoFormula)
        "
        class="card"
      >
        <EmptyState
          title="还没有识别记录，快去体验吧~"
          description="拍照或上传公式图片，最近10条识别记录会显示在这里。"
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
  margin-top: 20px;
}
.section-heading {
  align-items: flex-end;
}
.section-heading h2 {
  font-size: 16px;
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

<script setup lang="ts">
// 仅在显式 --extends 测试层中存在；样板使用真实 default 布局。
definePageMeta({
  middleware(to) {
    const width = to.query.width
    to.meta.contentWidth = width === 'reading' || width === 'workspace' ? width : 'compact'
    to.meta.bottomNav = to.query.nav !== 'off'
  },
})
useHead({ title: 'Formula AI · R3 布局验收样板' })
const route = useRoute()
const modal = ref(false)
const draft = ref('')
const { showToast } = useToast()
const composer = computed(() => route.query.composer === 'on')
</script>

<template>
  <div :class="{ 'composer-reserve': composer }">
    <PageHeader title="布局与导航验收" back-to="/profile" />
    <p class="info-note">隔离样板 · 不连接账号，不保存业务数据</p>
    <h2 class="section">宽度按页面选择，内容保持从容</h2>
    <p class="prose">移动端单列。桌面按需选择紧凑、阅读或工作区，现有页面继续默认兼容。</p>
    <div class="chip-list section" aria-label="样板布局切换">
      <NuxtLink
        v-for="width in ['compact', 'reading', 'workspace']"
        :key="width"
        :to="{ query: { ...route.query, width } }"
        class="chip"
      >
        {{ width }}
      </NuxtLink>
      <NuxtLink :to="{ query: { ...route.query, nav: 'off' } }" class="chip">隐藏导航</NuxtLink>
      <NuxtLink :to="{ query: { ...route.query, composer: 'on' } }" class="chip">
        显示输入区
      </NuxtLink>
    </div>
    <div class="row section">
      <button class="button button-primary" @click="modal = true">打开布局弹窗</button>
      <button class="button button-white" @click="showToast('布局反馈：请继续阅读。')">
        显示反馈
      </button>
    </div>
    <div class="card sample-paper section">
      <h2>长公式仅在内容区域滚动</h2>
      <MathFormula
        latex="\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6} \quad \Longrightarrow \quad \lim_{n\to\infty} \frac{1}{n^3}\sum_{k=1}^{n} k^2 = \frac{1}{3}"
      />
    </div>
    <div class="stack section">
      <article v-for="index in 12" :key="index" class="card sample-paper">
        <h2>阅读片段 {{ index }}</h2>
        <p class="prose">
          把注意力留给推导与解释。固定导航始终可见，页面末尾仍然可以完整阅读和操作。
        </p>
      </article>
    </div>
    <button
      id="layout-end"
      class="button button-primary button-block section"
      @click="modal = true"
    >
      页面末尾操作
    </button>
    <AppModal :open="modal" title="布局验证弹窗" @close="modal = false">
      <p class="prose">背景暂时停止滚动，弹窗在导航和输入区上方。按 Esc 或关闭按钮返回。</p>
      <label class="section field-label" for="layout-note">本次备注</label>
      <input id="layout-note" class="input" placeholder="仅作键盘焦点检查" />
    </AppModal>
    <ChatComposer
      v-if="composer"
      v-model="draft"
      @send="showToast('样板输入已收到，没有发送请求。')"
    />
  </div>
</template>

<style scoped>
.sample-paper {
  padding: 20px;
}
.sample-paper p {
  margin-top: 12px;
}
.composer-reserve {
  padding-bottom: calc(var(--chat-composer-height, 70px) + 42px);
}
</style>

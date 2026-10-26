<script setup lang="ts">
definePageMeta({ layout: false, bottomNav: false })
useHead({ title: 'Formula AI · R2 设计样板' })
const route = useRoute()
const layout = computed(() => (route.query.layout === 'wide' ? 'wide' : 'centered'))
const modal = ref(false)
const favorite = ref(false)
const name = ref('我的代数笔记')
const errorExample = ref('')
const invalid = computed(() => !errorExample.value.trim())
const { showToast } = useToast()
function save() {
  if (name.value.trim()) showToast('笔记已保存到本次样板。')
}
</script>

<template>
  <div class="design-sample" :data-layout="layout">
    <header class="sample-toolbar">
      <div class="sample-brand">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <strong>Formula AI</strong>
        <span>设计样板 · R2</span>
      </div>
      <nav class="sample-switch" aria-label="仅预览布局对比">
        <NuxtLink to="/__preview" :aria-current="layout === 'centered' ? 'page' : undefined">
          480 居中
        </NuxtLink>
        <NuxtLink
          to="/__preview?layout=wide"
          :aria-current="layout === 'wide' ? 'page' : undefined"
        >
          桌面自适应
        </NuxtLink>
      </nav>
    </header>
    <main class="sample-frame" id="sample-main">
      <header class="sample-hero">
        <p class="sample-eyebrow">留一点空白，给思考。</p>
        <PageIntro
          title="把思考，留在纸上"
          subtitle="清晰的公式，轻盈的界面。让每一次理解，都有迹可循。"
        />
        <img class="sample-art" src="/images/library-paper.svg" alt="" aria-hidden="true" />
        <p class="sample-notice">本地视觉样板 · 不连接账号，不保存业务数据</p>
      </header>
      <div class="sample-grid">
        <section aria-labelledby="reading-title">
          <div class="sample-section-heading">
            <span>01</span>
            <h2 id="reading-title">内容，始终是主角</h2>
          </div>
          <article class="card sample-card formula-specimen">
            <div class="row between">
              <span class="badge">代数</span>
              <FavoriteButton
                :active="favorite"
                label="收藏样板公式"
                @toggle="favorite = !favorite"
              />
            </div>
            <h3>一元二次方程</h3>
            <MathFormula latex="x^2 - 5x + 6 = 0" />
            <p class="sample-copy">先看清公式，再理解每个符号。恰到好处的留白，让内容自然呼吸。</p>
            <div class="sample-author">
              <UserAvatar :size="32" />
              <span>
                公式探索者
                <span class="sample-caption">刚刚整理 · 公式版本 v1</span>
              </span>
            </div>
            <button class="button button-primary button-block" @click="modal = true">
              <AppIcon name="sparkles" :size="18" />
              查看解释
            </button>
          </article>
        </section>
        <section aria-labelledby="control-title">
          <div class="sample-section-heading">
            <span>02</span>
            <h2 id="control-title">每一步，都有回应</h2>
          </div>
          <form class="card sample-card stack" @submit.prevent="save">
            <div class="sample-button-grid">
              <button class="button button-primary" type="submit">保存笔记</button>
              <button
                class="button button-white"
                type="button"
                @click="showToast('已保留这次修改。')"
              >
                稍后整理
              </button>
              <button class="button button-secondary" type="button" disabled>尚未选择</button>
              <button class="button button-primary" type="button" disabled aria-busy="true">
                <span class="busy-indicator" aria-hidden="true" />
                正在保存
              </button>
            </div>
            <label>
              <span class="field-label">笔记名称</span>
              <input
                v-model="name"
                class="input"
                maxlength="100"
                required
                placeholder="为这次思考起个名字"
              />
            </label>
            <div>
              <label for="error-example" class="field-label">错误反馈示例</label>
              <input
                id="error-example"
                v-model="errorExample"
                class="input"
                placeholder="公式名称"
                :aria-invalid="invalid"
                aria-describedby="sample-error"
              />
              <p v-if="invalid" id="sample-error" class="error-text" role="alert">
                请填写公式名称，再继续保存。
              </p>
              <p v-else id="sample-error" class="info-note">名称格式正确。</p>
            </div>
            <p class="sample-caption">键盘 Tab 可查看焦点；加载中不会重复提交。</p>
          </form>
        </section>
        <section aria-labelledby="feedback-title">
          <div class="sample-section-heading">
            <span>03</span>
            <h2 id="feedback-title">状态清楚，心里有数</h2>
          </div>
          <div class="card sample-card stack">
            <div class="row sample-statuses">
              <span class="badge badge-success">已保存</span>
              <span class="badge badge-warning">待核对</span>
              <span class="badge badge-danger">识别失败</span>
              <span class="badge badge-info">排队中</span>
            </div>
            <div class="sample-error-state" role="alert">
              <AppIcon name="info" :size="20" />
              <div>
                <h3>这次还没有读清楚</h3>
                <p>换一张更清晰、光线均匀的图片试试。</p>
                <button type="button" class="text-button" @click="showToast('已准备好重新选择。')">
                  重新选择
                  <AppIcon name="arrowRight" :size="15" />
                </button>
              </div>
            </div>
            <EmptyState title="给灵感留一个位置" description="收藏一个公式，慢慢建立你的知识库。" />
          </div>
        </section>
        <section aria-labelledby="math-title">
          <div class="sample-section-heading">
            <span>04</span>
            <h2 id="math-title">长内容，也从容展开</h2>
          </div>
          <div class="card sample-card stack">
            <div>
              <p class="sample-caption">连续正文与数学排版</p>
              <h3>从一个问题，走向理解</h3>
            </div>
            <p class="sample-copy">
              将二次多项式写成两个一次因式的乘积，可以更直观地找到方程的根。
            </p>
            <div class="sample-math">
              <MathFormula
                latex="(x-2)(x-3)=0 \quad\Rightarrow\quad x=2\;\text{或}\;x=3"
                tabindex="0"
                role="region"
                aria-label="长公式，可横向滚动"
              />
            </div>
            <p class="sample-copy">
              公式超出可用宽度时，在公式区域横向滚动，正文和操作区域保持稳定。
            </p>
            <div class="sample-loading" role="status" aria-label="正在读取公式">
              <div class="skeleton" />
              <div class="skeleton" />
              <div class="skeleton" />
            </div>
            <p class="sample-caption">低干扰的加载占位，为内容保留位置。</p>
          </div>
        </section>
      </div>
      <footer class="sample-footer">
        纸页灵感 · 轻装饰，重内容
        <span>视觉方向待确认，尚未应用到全部页面。</span>
      </footer>
    </main>
    <AppModal :open="modal" title="理解这个公式" @close="modal = false">
      <div class="stack">
        <MathFormula latex="x^2-5x+6=(x-2)(x-3)" />
        <p class="sample-copy">两个因式至少有一个等于零，所以方程的根为 2 和 3。</p>
        <button class="button button-primary button-block" @click="modal = false">明白了</button>
      </div>
    </AppModal>
    <AppToast />
  </div>
</template>

<style scoped>
.design-sample {
  --gradient-primary: linear-gradient(115deg, #7145d9, #6036ca);
  --color-muted: var(--color-text-secondary);
  --control-font-size: var(--font-size-small);
  min-height: 100dvh;
  color: var(--color-text);
  background: radial-gradient(ellipse at 10% 0%, #e9e3ff70, transparent 42%), #f7f8fd;
  font-size: var(--font-size-body);
  line-height: var(--line-height-body);
}
.sample-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 32px;
  border-bottom: 1px solid var(--color-border);
  background: #ffffffb8;
}
.sample-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 18px;
  letter-spacing: -0.3px;
}
.sample-brand > span {
  margin-left: 12px;
  color: var(--color-text-secondary);
  font-size: 12px;
  letter-spacing: 0;
}
.sample-switch {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: #fff;
}
.sample-switch a {
  display: grid;
  place-items: center;
  min-height: var(--control-hit-area);
  padding: 0 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  white-space: nowrap;
  color: var(--color-text-secondary);
}
.sample-switch a[aria-current] {
  background: var(--color-primary-soft);
  color: #5431ba;
  font-weight: 600;
}
.sample-frame {
  max-width: 480px;
  margin: 0 auto;
  padding: var(--space-10) var(--space-6) calc(var(--space-12) + env(safe-area-inset-bottom));
}
.sample-hero {
  position: relative;
  min-height: 210px;
  padding-top: 8px;
}
.sample-eyebrow {
  color: #6c4caa;
  font-size: 12px;
  letter-spacing: 1.5px;
  margin-bottom: 8px;
}
.sample-hero :deep(.page-intro) {
  min-height: auto;
  margin-bottom: 16px;
  padding-top: 8px;
}
.sample-hero :deep(.intro-title) {
  font-size: 28px;
  letter-spacing: -0.7px;
}
.sample-hero :deep(.page-intro p) {
  max-width: 280px;
  color: var(--color-text-secondary);
  font-size: 14px;
}
.sample-art {
  position: absolute;
  width: 158px;
  height: 154px;
  right: -22px;
  top: -34px;
  opacity: 0.32;
  pointer-events: none;
}
.sample-notice {
  color: var(--color-text-secondary);
  font-size: 12px;
  padding-bottom: 24px;
}
.sample-grid {
  display: grid;
  gap: var(--space-8);
}
.sample-grid > section {
  min-width: 0;
}
.sample-section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.sample-section-heading > span {
  font-size: 12px;
  color: #886ba9;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
}
.sample-section-heading h2 {
  font-size: 16px;
  font-weight: 600;
}
.sample-card {
  padding: var(--space-6);
  border: 1px solid #eeebf5;
}
.sample-card h3 {
  font-size: 17px;
  line-height: 1.5;
  font-weight: 600;
}
.formula-specimen h3 {
  margin-top: 14px;
}
.formula-specimen > :deep(.math-formula) {
  font-size: 21px;
  padding: 10px 0 12px;
}
.sample-copy {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.85;
}
.sample-author {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.sample-author .sample-caption {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.sample-caption {
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.sample-button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.sample-button-grid .button {
  padding-inline: 10px;
}
.sample-statuses {
  flex-wrap: wrap;
  gap: 8px;
}
.badge {
  font-size: 12px;
  padding: 5px 9px;
}
.sample-error-state {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #f9f6fc;
  border-radius: var(--radius-control);
  color: #7c4965;
}
.sample-error-state h3 {
  font-size: 14px;
}
.sample-error-state p {
  font-size: 12px;
  margin-top: 4px;
  color: var(--color-text-secondary);
}
.sample-error-state :deep(.app-icon) {
  flex-shrink: 0;
  margin-top: 2px;
}
.sample-error-state .text-button {
  min-height: 44px;
}
:deep(.empty-state) {
  padding: 24px 4px 4px;
  gap: 12px;
}
:deep(.empty-state h2) {
  font-size: 16px;
}
:deep(.empty-state p) {
  font-size: 13px;
}
.sample-math {
  min-width: 0;
  border-block: 1px solid var(--color-border);
  padding: 12px 0;
}
.sample-math :deep(.math-formula:focus-visible) {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}
.sample-loading {
  display: grid;
  gap: 12px;
  margin-top: 4px;
}
.sample-loading .skeleton:nth-child(2) {
  width: 85%;
}
.sample-loading .skeleton:nth-child(3) {
  width: 62%;
}
.sample-footer {
  color: var(--color-text-secondary);
  text-align: center;
  font-size: 12px;
  margin-top: 40px;
}
.sample-footer span {
  display: block;
  font-size: 12px;
  margin-top: 6px;
}
@media (min-width: 900px) {
  [data-layout='wide'] .sample-frame {
    max-width: 1080px;
  }
  [data-layout='wide'] .sample-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
  [data-layout='wide'] .sample-hero {
    min-height: 210px;
    padding-top: 16px;
  }
  [data-layout='wide'] .sample-art {
    width: 250px;
    height: 230px;
    right: 20px;
    top: -28px;
    opacity: 0.7;
  }
  [data-layout='wide'] .sample-hero :deep(.intro-title) {
    font-size: 36px;
  }
  [data-layout='wide'] .sample-hero :deep(.page-intro p) {
    max-width: 440px;
  }
}
@media (max-width: 600px) {
  .sample-toolbar {
    padding: 12px 16px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .sample-brand {
    width: 100%;
    font-size: 17px;
  }
  .sample-brand > span {
    margin-left: auto;
  }
  .sample-switch {
    width: 100%;
  }
  .sample-switch a {
    flex: 1;
  }
  .sample-frame {
    padding-top: 28px;
  }
  .sample-card {
    padding: 20px;
  }
  .sample-hero :deep(.intro-title) {
    font-size: 26px;
  }
  .sample-art {
    right: -12px;
    width: 140px;
  }
}
</style>

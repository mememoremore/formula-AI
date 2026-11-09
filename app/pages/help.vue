<script setup lang="ts">
definePageMeta({ bottomNav: false, contentWidth: 'reading' })
useHead({ title: '使用帮助 · 墨析' })

const questions = [
  {
    title: '没有图片，也能创建公式吗？',
    answer:
      '可以；从首页点击「输入 LaTeX」，登录后填写名称与源码，实时预览并保存；手动输入不使用识别次数，保存后可分类、收藏、编辑、解释和导出。',
  },
  {
    title: '自由提问与 AI 结构化解释有什么区别？',
    answer:
      '自由提问由你输入问题；AI 结构化解释按概述、符号、条件、步骤、例子及注意事项整理公式内容，可查看历史、重新生成或基于原解释继续追问；两者共用 AI 可用次数；重新生成会创建新的解释，查看历史不会。',
  },
  {
    title: '复制 LaTeX 后，如何放入 Word？',
    answer:
      '支持 LaTeX 输入的 Windows Word 可按 Alt+= 插入公式，选择兼容的 LaTeX 输入模式后粘贴并转换；Word/WPS 并非支持所有命令；复杂情况优先下载可编辑 DOCX；复制完整解释是普通文本，不等于 Word 原生可编辑公式。',
  },
  {
    title: '分类和收藏会保存在哪里？删除分类会删除公式吗？',
    answer:
      '登录后的公式库、分类和收藏保存在账号，刷新后仍可读取；删除分类只把公式移至未分类，公式和收藏都会保留。',
  },
  {
    title: '现在可以真实识别图片吗？',
    answer:
      '账号识别支持调用图片识别模型，图片会上传到私有存储，识别结果保存到账号；是否使用真实模型由管理员配置，模拟结果会明确标注；模型识别也可能出错，请核对公式。',
  },
  {
    title: '如何修改公式？',
    answer:
      '打开公式详情并点击「编辑」，修改 LaTeX 后实时预览；公式确认后保存，保存后使用更新后的内容；其他窗口同时编辑时，会提示先读取最新内容。',
  },
  {
    title: '支持什么图片？',
    answer:
      '支持 JPG/JPEG、PNG 静态图片，每张不超过10MB、2000万像素；单公式和上下分开的多公式图片均可识别；批量处理每批最多10张，可先一键检测再调整区域；暂不支持 HEIC、WebP、GIF 或 PDF。',
  },
  {
    title: '为什么刷新后图片不见了？',
    answer:
      '上传的图片会保存，可从账号识别历史重新打开；如果暂时无法读取原图，可以稍后重试，已保存的公式仍保留。',
  },
  {
    title: 'AI 回答和 Word 导出能用了吗？',
    answer:
      '账号 AI 对话支持逐步显示已保存的回答、连续追问、刷新恢复和停止生成，并不保证逐 Token 实时传输；管理员配置 DeepSeek 后可使用真实回答；模拟模式会明确标注；AI 可能出错，请核对推导和结论；从账号公式详情可生成并下载包含原生可编辑公式的 Word。',
  },
  {
    title: '提交后网络断开，要再点一次吗？',
    answer:
      '先重新读取原任务；提交结果尚未确认时，应使用页面提供的确认入口，沿用原请求标识；不要反复新建任务；已确认失败后的重新提交会创建新任务，并使用新的对应额度；下载已完成的 Word 不会重新生成文档。',
  },
  {
    title: '为什么没有更早的聊天记录？',
    answer:
      '当前会话最多展示最近 100 条消息；页面会提示存在更早记录；首版暂不支持在页面继续加载更早消息，不代表更早内容已被删除。',
  },
]
</script>

<template>
  <PageHeader title="使用帮助" back-to="/profile" />
  <PageIntro
    :level="2"
    title="从图片或 LaTeX 开始"
    subtitle="上传、校正、理解，每一步都有清晰的思路。"
    artwork="formula"
    inline-artwork
  />
  <ol class="help-steps">
    <li>
      <strong>选择你的输入方式</strong>
      <p>裁剪清晰图片，或从首页直接输入 LaTeX。</p>
    </li>
    <li>
      <strong>查看并校正公式</strong>
      <p>核对结果，必要时编辑 LaTeX 并保存。</p>
    </li>
    <li>
      <strong>借助 AI 理解</strong>
      <p>选择结构化解释或自由提问，再继续追问；需要文档时导出 DOCX。</p>
    </li>
  </ol>
  <div class="card help-questions">
    <details v-for="question in questions" :key="question.title" class="help-item">
      <summary>
        {{ question.title }}
        <AppIcon name="plus" :size="17" />
      </summary>
      <p>{{ question.answer }}</p>
    </details>
  </div>
  <NuxtLink to="/upload" class="button button-primary button-block section">
    体验公式识别流程
    <AppIcon name="arrowRight" :size="16" />
  </NuxtLink>
</template>

<style scoped>
.help-steps {
  counter-reset: steps;
  list-style: none;
  padding: 0;
  margin: 0 0 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.help-steps li {
  position: relative;
  padding-left: 44px;
  font-size: 14px;
  line-height: 1.8;
}
.help-steps li::before {
  counter-increment: steps;
  content: counter(steps);
  position: absolute;
  left: 0;
  top: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.help-steps p {
  margin-top: 5px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.help-item {
  padding: 8px 18px;
}
summary {
  min-height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  list-style: none;
  line-height: 1.7;
}
summary::-webkit-details-marker {
  display: none;
}
summary svg {
  color: var(--color-primary);
  flex-shrink: 0;
}
details[open] summary svg {
  transform: rotate(45deg);
}
.help-item p {
  font-size: 14px;
  color: var(--color-muted);
  line-height: 1.95;
  margin-top: 15px;
}
.help-item + .help-item {
  border-top: 1px solid var(--color-border);
}
.help-item p {
  margin: 4px 0 12px;
}
</style>

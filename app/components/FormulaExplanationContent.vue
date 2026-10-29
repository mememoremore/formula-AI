<script setup lang="ts">
import type { FormulaExplanation } from '#shared/explanation'
defineProps<{ value: FormulaExplanation }>()
</script>
<template>
  <div class="formula-explanation" data-testid="structured-explanation">
    <div class="explanation-summary"><ChatMessageContent :content="value.summary" /></div>
    <section v-if="value.symbols.length">
      <h3>符号含义</h3>
      <dl>
        <div v-for="(symbol, index) in value.symbols" :key="index">
          <dt><MathFormula :latex="symbol.latex" :display="false" /></dt>
          <dd>{{ symbol.meaning }}</dd>
        </div>
      </dl>
    </section>
    <section v-if="value.conditions.length">
      <h3>适用条件</h3>
      <ul>
        <li v-for="(item, index) in value.conditions" :key="index">
          <ChatMessageContent :content="item" />
        </li>
      </ul>
    </section>
    <section v-if="value.steps.length">
      <h3>理解与推导</h3>
      <ol>
        <li v-for="(step, index) in value.steps" :key="index">
          <h4>{{ step.title }}</h4>
          <ChatMessageContent :content="step.text" />
          <MathFormula v-if="step.latex" :latex="step.latex" />
        </li>
      </ol>
    </section>
    <section v-if="value.examples.length">
      <h3>应用例子</h3>
      <ul>
        <li v-for="(item, index) in value.examples" :key="index">
          <ChatMessageContent :content="item" />
        </li>
      </ul>
    </section>
    <section v-if="value.warnings.length" class="explanation-warning">
      <h3>限制与注意</h3>
      <ul>
        <li v-for="(item, index) in value.warnings" :key="index">
          <ChatMessageContent :content="item" />
        </li>
      </ul>
    </section>
    <p class="info-note">AI 解释可能有误，请结合课程条件核对；渲染成功不代表数学证明正确。</p>
  </div>
</template>
<style scoped>
.formula-explanation {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.85;
}
.explanation-summary {
  font-size: 16px;
  color: var(--color-text);
}
section {
  margin-top: 24px;
}
h3 {
  font-size: 15px;
  margin-bottom: 12px;
}
h4 {
  font-size: 14px;
  margin-bottom: 6px;
}
ul,
ol {
  padding-left: 20px;
}
li + li {
  margin-top: 12px;
}
dl > div {
  display: grid;
  grid-template-columns: minmax(44px, auto) minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
}
dt {
  min-width: 0;
  max-width: 120px;
}
dd {
  margin: 0;
  min-width: 0;
}
.explanation-warning {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 14px;
}
.info-note {
  margin-top: 20px;
}
</style>

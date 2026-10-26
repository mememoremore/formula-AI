<script setup lang="ts">
withDefaults(defineProps<{ kind?: 'formula' | 'book' | 'idea'; compact?: boolean }>(), {
  kind: 'formula',
})
</script>
<template>
  <div class="paper-artwork" :class="{ compact }" aria-hidden="true">
    <div class="paper back" />
    <div class="paper front">
      <span class="tape" />
      <MathFormula
        :latex="
          kind === 'book' ? 'a^2+b^2=c^2' : kind === 'idea' ? '\\int_0^1 x^2\\,dx' : 'x^2-5x+6=0'
        "
        :display="false"
      />
      <svg viewBox="0 0 180 100" class="curve">
        <path d="M15 80H165M60 95V8" stroke="#8b8d9f" stroke-width="1" />
        <path
          v-if="kind === 'book'"
          d="M45 75L45 22L130 75Z"
          fill="none"
          stroke="#6862aa"
          stroke-width="2"
        />
        <path v-else d="M20 15Q95 155 160 15" fill="none" stroke="#6862aa" stroke-width="2" />
        <circle cx="60" cy="80" r="2" fill="#6257e5" />
      </svg>
    </div>
    <span class="pencil" />
    <span class="art-spark">✧</span>
  </div>
</template>
<style scoped>
.paper-artwork {
  position: relative;
  width: 220px;
  height: 210px;
  pointer-events: none;
}
.paper {
  position: absolute;
  width: 165px;
  height: 180px;
  left: 24px;
  top: 16px;
  border: 1px solid #eae5dd;
  border-radius: 3px;
  background-color: #fffcf5;
  background-image: radial-gradient(#c8c0d448 0.7px, transparent 0.7px);
  background-size: 12px 12px;
  box-shadow: 0 8px 18px #3930460d;
}
.back {
  transform: rotate(12deg) translate(12px, -4px);
  background-color: #f1eefa;
  border-color: #e9e4f7;
}
.front {
  transform: rotate(-9deg);
  padding: 24px 12px 10px;
}
.front :deep(.math-inline) {
  font-size: 12px;
  color: #38354d;
}
.tape {
  position: absolute;
  width: 55px;
  height: 18px;
  left: 55px;
  top: -9px;
  background: #dcd4f680;
  transform: rotate(7deg);
}
.curve {
  width: 100%;
  height: 100px;
  margin-top: 15px;
}
.pencil {
  position: absolute;
  width: 10px;
  height: 120px;
  right: 17px;
  bottom: 0;
  transform: rotate(-24deg);
  border-radius: 3px;
  background: linear-gradient(90deg, #9d86ec 33%, #ccbaf9 33%, #ccbaf9 66%, #8f76df 66%);
  box-shadow: 3px 4px 6px #41325e12;
}
.pencil::after {
  content: '';
  position: absolute;
  top: -15px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 16px solid #c2a17c;
}
.art-spark {
  position: absolute;
  top: 0;
  left: 5px;
  color: #a896e8;
  font-size: 30px;
}
.compact {
  /* 保留完整画布再缩放，纸张和铅笔的定位不会溢出缩略图容器。 */
  transform: scale(0.5);
  transform-origin: top left;
}
</style>

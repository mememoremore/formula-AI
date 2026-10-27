<template>
  <div class="library-grid"><slot /></div>
</template>
<!-- 使用唯一命名的公共类，允许按祖先布局模式选择列数。 -->
<style>
.library-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
}
@media (min-width: 900px) {
  .layout-workspace .library-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}
</style>

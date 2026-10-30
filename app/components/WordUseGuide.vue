<template>
  <details class="word-guide info-note">
    <summary>在 Word 中使用公式</summary>
    <p>
      支持 LaTeX 输入的 Windows Word 中，可按 Alt+= 插入公式，选择兼容的 LaTeX
      输入模式后粘贴源码，再转换为专业格式。
    </p>
    <p>
      Word/WPS 对 LaTeX
      的支持因版本而异，并非所有命令都能转换。复制完整解释得到的是普通文本；复杂公式优先下载现有的可编辑
      DOCX。
    </p>
  </details>
</template>
<style scoped>
.word-guide {
  margin-block: 12px;
  overflow-wrap: anywhere;
}
summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
}
p + p {
  margin-top: 8px;
}
</style>

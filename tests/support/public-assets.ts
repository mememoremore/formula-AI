/** 只检查可静态确定的根路径图片/字体；动态 URL 与 API 另由页面回归覆盖。 */
export function publicAssetReferences(source: string): string[] {
  const paths = new Set<string>()
  for (const expression of [
    /(?:src|poster)\s*=\s*["'](\/[^"']+)["']/g,
    /url\(\s*["']?(\/[^\s)"']+)["']?\s*\)/g,
  ]) {
    for (const match of source.matchAll(expression)) {
      const path = match[1]!.split(/[?#]/)[0]!
      if (path.startsWith('//') || path.startsWith('/api/') || /[{}$]/.test(path)) continue
      if (/\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i.test(path)) paths.add(path)
    }
  }
  return [...paths].sort()
}

import ts from 'typescript'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const entries = ['library', 'detail', 'recognition', 'chat', 'account']
for (const name of entries) {
  let source = readFileSync(`tests/design-preview/check-${name}-browser.js`, 'utf8')
  const ast = ts.createSourceFile(
    name + '.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const cuts = []
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'page.screenshot')
      cuts.push([node.getStart(ast), node.end])
    ts.forEachChild(node, visit)
  }
  visit(ast)
  for (const [start, end] of cuts.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, start) + 'Promise.resolve()' + source.slice(end)
  mkdirSync(`tmp/r11-regression-${name}`, { recursive: true })
  writeFileSync(`tmp/r11-check-${name}.js`, source)
  console.log(`${name}: 保留全部断言，仅禁用 ${cuts.length} 处截图调用`)
}

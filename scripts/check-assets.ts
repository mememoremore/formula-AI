import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { publicAssetReferences } from '../tests/support/public-assets.ts'

const root = resolve('public')
const missing: { file: string; asset: string }[] = []
function scan(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) scan(file)
    else if (/\.(vue|css|ts)$/.test(entry.name)) {
      for (const asset of publicAssetReferences(readFileSync(file, 'utf8'))) {
        const target = resolve(root, '.' + asset)
        if (!target.startsWith(root + sep) || !existsSync(target) || !statSync(target).isFile())
          missing.push({ file: relative(process.cwd(), file), asset })
      }
    }
  }
}
scan('app')
for (const entry of missing) console.error(`${entry.file}: 缺少 public${entry.asset}`)
console.log(`静态资源检查：${missing.length} 项缺失；不检查动态地址或运行时布局。`)
if (missing.length) process.exitCode = 1

import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createRecognitionAdapter } from '../server/recognition/factory'
import { withInferenceDeadline } from '../server/inference/deadline'

const imagePath = process.argv[2]
if (!imagePath || process.env.NUXT_RECOGNITION_PROVIDER !== 'python')
  throw new Error('请配置python识别模式，并运行 npm run recognition:check -- 图片路径。')
const image = await readFile(imagePath)
const started = performance.now()
const result = await withInferenceDeadline((signal) =>
  createRecognitionAdapter().recognize(
    {
      image,
      mimeType: /\.jpe?g$/i.test(imagePath) ? 'image/jpeg' : 'image/png',
      mode: 'printed',
    },
    signal,
  ),
)
assert.equal(result.isMock, false)
const evidence = {
  checkedAt: new Date().toISOString(),
  elapsedMs: Math.round(performance.now() - started),
  ...result,
}
await mkdir('artifacts', { recursive: true })
await writeFile(
  'artifacts/recognition-live-verification.json',
  `${JSON.stringify(evidence, null, 2)}\n`,
)
console.log(JSON.stringify(evidence, null, 2))

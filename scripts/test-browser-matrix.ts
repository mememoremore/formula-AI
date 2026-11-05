import { spawn } from 'node:child_process'

const mode = process.argv[2] ?? 'e2e'
if (!['e2e', 'queries'].includes(mode)) throw new Error('无效的浏览器矩阵组')
// Each journey owns fresh DB/S3/queue state and keeps real signup/OTP rate limits.
const runs: { viewport: number | 'shared'; file: string }[] = []
for (const viewport of [320, 390, 430, 1440])
  for (const file of mode === 'queries'
    ? ['query-library.spec.ts']
    : ['journey.spec.ts', 'r18.spec.ts', 'r19.spec.ts'])
    runs.push({ viewport, file })
if (mode === 'e2e')
  runs.push(
    { viewport: 390, file: 'current-formula.spec.ts' },
    { viewport: 1440, file: 'layout-polish.spec.ts' },
    ...[
      'explanation-math.spec.ts',
      'explanation-presentation.spec.ts',
      'observability.spec.ts',
      'profile-input.spec.ts',
    ].map((file) => ({ viewport: 'shared' as const, file })),
  )
let child: ReturnType<typeof spawn> | undefined
let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    interrupted = true
    child?.kill(signal)
  })
for (const { viewport, file } of runs) {
  if (interrupted) {
    process.exitCode = 1
    break
  }
  child = spawn(
    process.execPath,
    ['--import=tsx', 'scripts/test-isolated.ts', mode, String(viewport), file],
    {
      // Preserve explicit inputs so the R1 guard rejects conflicts rather than hiding them.
      env: { ...process.env },
      stdio: 'inherit',
      windowsHide: true,
    },
  )
  const code = await new Promise<number>((done, reject) => {
    child!.once('error', reject)
    child!.once('exit', (value) => done(value ?? 1))
  })
  console.log(`viewport ${viewport} / ${file}: exit=${code}`)
  if (code !== 0) {
    process.exitCode = code
    break
  }
}

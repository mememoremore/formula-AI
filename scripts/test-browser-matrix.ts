import { spawn } from 'node:child_process'

// Each journey keeps real authentication limits and owns fresh DB/S3/queue state.
// Sharing one IP/database across eight registrations otherwise tests the signup limiter.
let child: ReturnType<typeof spawn> | undefined
let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    interrupted = true
    child?.kill(signal)
  })
for (const width of [320, 390, 430, 1440]) {
  if (interrupted) {
    process.exitCode = 1
    break
  }
  child = spawn(
    process.execPath,
    ['--import=tsx', 'scripts/test-isolated.ts', 'e2e', String(width)],
    {
      // Preserve explicit inputs so the R1 guard rejects conflicts, rather than hiding them.
      env: { ...process.env },
      stdio: 'inherit',
      windowsHide: true,
    },
  )
  const code = await new Promise<number>((done, reject) => {
    child!.once('error', reject)
    child!.once('exit', (value) => done(value ?? 1))
  })
  console.log(`viewport ${width}: exit=${code}`)
  if (code !== 0) {
    process.exitCode = code
    break
  }
}

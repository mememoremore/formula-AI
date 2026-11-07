import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createGzip } from 'node:zlib'

// Explicit whitelist: no .env, database volumes, backups, certificates or user uploads.
const files = [
  'compose.production.yaml',
  'deploy/production.env.example',
  'deploy/create-env.mjs',
  'deploy/install-compose.sh',
  'deploy/compose.sh',
  'deploy/start.sh',
  'deploy/nginx-location.conf',
  'deploy/nginx-site.conf',
  'deploy/install-nginx-site.sh',
  'deploy/README.md',
]
const images = [
  'formula-ai:production',
  'formula-ai-recognition:cpu-v1',
  'postgres:17-alpine',
  'chrislusf/seaweedfs:4.48',
]
const output = resolve(
  'tmp/releases',
  'formula-ai-' + new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(output, { recursive: true })
const docker = (args) =>
  execFileSync('docker', args, { encoding: 'utf8', windowsHide: true }).trim()
const manifest = {
  createdAt: new Date().toISOString(),
  platform: 'linux/amd64',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  images: [],
  files: {},
}
for (const name of images) {
  const info = JSON.parse(docker(['image', 'inspect', name]))[0]
  if (info.Os !== 'linux' || info.Architecture !== 'amd64')
    throw new Error('Wrong image platform: ' + name)
  manifest.images.push({ name, id: info.Id, unpackedBytes: info.Size })
}
for (const file of files) {
  await mkdir(dirname(resolve(output, file)), { recursive: true })
  await copyFile(file, resolve(output, file))
}
const binary = resolve(output, 'docker-compose-linux-x86_64')
const response = await fetch(
  'https://github.com/docker/compose/releases/download/v5.7.0/docker-compose-linux-x86_64',
  { signal: AbortSignal.timeout(180000) },
)
if (!response.ok || !response.body) throw new Error('Compose download failed')
await pipeline(Readable.fromWeb(response.body), createWriteStream(binary, { flags: 'wx' }))
async function hash(file) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(file)) h.update(chunk)
  return h.digest('hex')
}
if ((await hash(binary)) !== '7758048ad38e580f22559603312874fec8bb638d021a9e64182385fc17cc12a2')
  throw new Error('Compose checksum mismatch')
console.log('Verified Compose plugin; exporting four Linux images...')
const save = spawn('docker', ['image', 'save', ...images], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'inherit'],
})
const done = new Promise((yes, no) => {
  save.on('error', no)
  save.on('close', (code) => (code === 0 ? yes() : no(new Error('docker save failed'))))
})
await Promise.all([
  pipeline(
    save.stdout,
    createGzip({ level: 3 }),
    createWriteStream(resolve(output, 'images.tar.gz'), { flags: 'wx' }),
  ),
  done,
])
execFileSync(
  'tar',
  [
    '-czf',
    resolve(output, 'models.tar.gz'),
    '-C',
    resolve('../model'),
    'inference.json',
    'inference.pdiparams',
    'inference.yml',
  ],
  { windowsHide: true, stdio: 'inherit' },
)
const names = [...files, 'docker-compose-linux-x86_64', 'images.tar.gz', 'models.tar.gz']
for (const name of names) manifest.files[name] = await hash(resolve(output, name))
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const checksums = names.map((name) => manifest.files[name] + '  ' + name).join('\n') + '\n'
await writeFile(resolve(output, 'SHA256SUMS'), checksums)
console.log('Release prepared: ' + output)
console.log(
  'Contains images, read-only model copy and public configuration. AI/SMTP keys and TLS private keys are excluded.',
)

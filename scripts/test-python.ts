import { execFileSync } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { cleanTestProcessEnvironment, assertLocalDocker } from '../tests/support/test-runtime.ts'

try {
  const python = process.env.FORMULA_TEST_PYTHON
  const program = `import socket, unittest
def denied(*args, **kwargs):
    raise RuntimeError("Python test network access denied")
socket.socket.connect = denied
socket.socket.connect_ex = denied
socket.create_connection = denied
suite = unittest.defaultTestLoader.discover('tests')
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
`
  if (python) {
    if (!isAbsolute(python) || !existsSync(python))
      throw new Error('FORMULA_TEST_PYTHON 必须是已安装测试依赖的 Python 绝对路径')
    execFileSync(python, ['-c', program], {
      cwd: 'services/recognition',
      env: cleanTestProcessEnvironment(),
      stdio: 'inherit',
      windowsHide: true,
    })
  } else {
    assertLocalDocker()
    // 只复用本机既有镜像的依赖，不启动其服务入口，不挂载模型或任何数据卷。
    // 绑定当前 app/tests 源码，避免镜像内旧测试被当作当前源码的结果。
    const image = execFileSync(
      'docker',
      ['image', 'inspect', 'formula-ai-recognition:cpu-v1', '--format', '{{.Id}}'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    ).trim()
    if (!/^sha256:[a-f0-9]{64}$/.test(image))
      throw new Error('没有可验证的本地 Python 测试依赖镜像；不会自动拉取或启动开发服务')
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        '--memory',
        '1g',
        '--cpus',
        '2',
        '--pids-limit',
        '128',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=64m',
        '--mount',
        `type=bind,src=${resolve('services/recognition')},dst=/workspace,readonly`,
        '--workdir',
        '/workspace',
        '--entrypoint',
        'python',
        image,
        '-c',
        program,
      ],
      { env: cleanTestProcessEnvironment(), stdio: 'inherit', windowsHide: true },
    )
  }
} catch (error) {
  console.error(
    error instanceof Error && !('status' in error) ? error.message : 'Python 服务测试失败',
  )
  process.exitCode = 1
}

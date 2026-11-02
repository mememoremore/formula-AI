param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskNode = (Resolve-Path (Join-Path $taskRoot '.tools/node-v24.22.0-win-x64/node.exe')).Path
if (!(Test-Path -LiteralPath $taskNode)) { throw '缺少项目固定 Node 运行时。' }
Push-Location $taskRoot
try {
  $taskExisting = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.ExecutablePath -eq $taskNode -and
    $_.CommandLine -notmatch '--port 3100|tests[/\\]' -and
    ($_.CommandLine -match 'nuxt.*dev|scripts[/\\]worker\.ts')
  })
  if ($taskExisting.Count -and !$Restart) { throw '项目进程已经运行；确认后使用 -Restart 安全重载。' }
  if ($taskExisting.Count) {
    & $taskNode --import=tsx scripts/observability-idle.ts
    if ($LASTEXITCODE -ne 0) { throw '无法确认空闲状态，未重载。' }
    foreach ($taskProcess in $taskExisting) { Stop-Process -Id $taskProcess.ProcessId -ErrorAction SilentlyContinue }
  }
  New-Item -ItemType Directory -Force tmp/observability | Out-Null
  $env:FORMULA_METRICS_ENABLED = 'true'
  $env:FORMULA_METRICS_PORT = '9464'
  $env:FORMULA_OTLP_ENDPOINT = 'http://127.0.0.1:4318/v1/traces'
  $env:FORMULA_LOG_DIR = Join-Path $taskRoot 'tmp/observability'
  $env:NUXT_PUBLIC_OBSERVABILITY_ENABLED = 'true'
  $env:FORMULA_SERVICE_NAME = 'formula-api'
  $taskApi = Start-Process -FilePath $taskNode -ArgumentList @('node_modules/nuxt/bin/nuxt.mjs','dev','--host','127.0.0.1') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput 'tmp/observe-dev.log' -RedirectStandardError 'tmp/observe-dev-error.log' -PassThru
  $env:FORMULA_SERVICE_NAME = 'formula-worker'
  $taskWorker = Start-Process -FilePath $taskNode -ArgumentList @('--import=tsx','scripts/worker.ts') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput 'tmp/observe-worker.log' -RedirectStandardError 'tmp/observe-worker-error.log' -PassThru
  Write-Output "Nuxt=$($taskApi.Id) Worker=$($taskWorker.Id) Grafana=http://127.0.0.1:3300"
} finally { Pop-Location }

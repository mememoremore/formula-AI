param([switch]$InitializeExisting)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskNode = (Resolve-Path (Join-Path $taskRoot '.tools/node-v24.22.0-win-x64/node.exe')).Path
Push-Location $taskRoot
try {
  & $taskNode --import=tsx scripts/observability-credentials.ts
  if ($LASTEXITCODE -ne 0) { throw '凭据准备失败。' }
  docker compose -f compose.observability.yaml -f compose.observability-secure.yaml --profile alerts up -d
  if ($LASTEXITCODE -ne 0) { throw '观测服务启动失败。' }
  docker compose -f compose.observability.yaml -f compose.observability-secure.yaml --profile alerts exec -T alertmanager amtool check-config /etc/alertmanager/config.yaml
  if ($LASTEXITCODE -ne 0) { throw '告警配置校验失败，未热加载。' }
  # Compose up does not reload changed bind-mounted files in an existing container.
  $taskReloaded = $false
  for ($taskAttempt = 0; $taskAttempt -lt 10; $taskAttempt++) {
    try {
      Invoke-WebRequest -Uri 'http://127.0.0.1:9093/-/reload' -Method Post -UseBasicParsing -TimeoutSec 3 | Out-Null
      $taskReloaded = $true
      break
    } catch { Start-Sleep -Seconds 1 }
  }
  if (!$taskReloaded) { throw '告警配置热加载失败，请检查Alertmanager；不能确认新通知设置已生效。' }
  if ($InitializeExisting -or !(Test-Path -LiteralPath 'tmp/observability-secrets/grafana-password-initialized')) {
    & $taskNode --import=tsx scripts/observability-auth.ts
    if ($LASTEXITCODE -ne 0) { throw '已有Grafana密码初始化失败。' }
  }
  Write-Output 'Grafana已启用登录；用户名admin，密码位于tmp/observability-secrets/grafana-admin-password。'
} finally { Pop-Location }

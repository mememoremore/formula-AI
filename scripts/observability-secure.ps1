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
  if ($InitializeExisting -or !(Test-Path -LiteralPath 'tmp/observability-secrets/grafana-password-initialized')) {
    & $taskNode --import=tsx scripts/observability-auth.ts
    if ($LASTEXITCODE -ne 0) { throw '已有Grafana密码初始化失败。' }
  }
  Write-Output 'Grafana已启用登录；用户名admin，密码位于tmp/observability-secrets/grafana-admin-password。'
} finally { Pop-Location }

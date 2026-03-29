$ErrorActionPreference = "Stop"

# Workaround: some environments contain both `Path` and `PATH` keys in the
# process environment block. Windows PowerShell's `Start-Process -NoNewWindow`
# fails when it tries to copy those into a case-insensitive dictionary.
$processEnv = [System.Environment]::GetEnvironmentVariables("Process")
if ($processEnv.ContainsKey("Path") -and $processEnv.ContainsKey("PATH")) {
  $pathValue = [System.Environment]::GetEnvironmentVariable("Path", "Process")
  if (-not $pathValue) {
    $pathValue = [System.Environment]::GetEnvironmentVariable("PATH", "Process")
  }

  [System.Environment]::SetEnvironmentVariable("Path", $pathValue, "Process")
  [System.Environment]::SetEnvironmentVariable("PATH", $null, "Process")
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$frontendDir = if ($env:FRONTEND_DIR) { $env:FRONTEND_DIR } else { "src" }
$backendDir = if ($env:BACKEND_DIR) { $env:BACKEND_DIR } else { "src-tauri" }
$frontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "1420" }
$tauriDevUrl = if ($env:TAURI_DEV_URL) { $env:TAURI_DEV_URL } else { "http://127.0.0.1:$frontendPort" }

function Stop-ProcessTree {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][int]$RootProcessId)

  $rootProcess = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
  if (-not $rootProcess) {
    return
  }

  $visited = New-Object System.Collections.Generic.HashSet[int]
  $queue = New-Object System.Collections.Generic.Queue[int]

  $visited.Add($RootProcessId) | Out-Null
  $queue.Enqueue($RootProcessId)

  while ($queue.Count -gt 0) {
    $processId = $queue.Dequeue()

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
      $childPid = [int]$child.ProcessId
      if (-not $visited.Contains($childPid)) {
        $visited.Add($childPid) | Out-Null
        $queue.Enqueue($childPid)
      }
    }
  }

  foreach ($processId in ($visited | Sort-Object -Descending)) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

function Wait-AnyExit {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][System.Diagnostics.Process[]]$Processes)

  while ($true) {
    foreach ($process in $Processes) {
      if ($process -and $process.HasExited) {
        return $process
      }
    }

    Start-Sleep -Milliseconds 200
  }
}

$env:TAURI_DEV_URL = $tauriDevUrl

Write-Host "Starting Vite dev server..." -ForegroundColor Green
$frontend = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("--prefix", $frontendDir, "run", "dev") `
  -WorkingDirectory $projectRoot `
  -NoNewWindow `
  -PassThru

Write-Host "Starting Tauri dev (TAURI_DEV_URL=$tauriDevUrl)..." -ForegroundColor Green
$backend = Start-Process `
  -FilePath "cargo" `
  -ArgumentList @("tauri", "dev") `
  -WorkingDirectory $projectRoot `
  -NoNewWindow `
  -PassThru

try {
  $exited = Wait-AnyExit -Processes @($frontend, $backend)

  if ($exited.Id -eq $frontend.Id) {
    Write-Host "Vite dev server exited; stopping Tauri dev..." -ForegroundColor Yellow
    Stop-ProcessTree -RootProcessId $backend.Id
  } else {
    Write-Host "Tauri dev exited; stopping Vite dev server..." -ForegroundColor Yellow
    Stop-ProcessTree -RootProcessId $frontend.Id
  }

  Wait-Process -Id @($frontend.Id, $backend.Id) -ErrorAction SilentlyContinue | Out-Null
} finally {
  if ($frontend -and -not $frontend.HasExited) {
    Stop-ProcessTree -RootProcessId $frontend.Id
  }
  if ($backend -and -not $backend.HasExited) {
    Stop-ProcessTree -RootProcessId $backend.Id
  }
}


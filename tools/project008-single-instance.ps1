param(
  [ValidateSet('Start','Status','Stop')][string]$Action = 'Start',
  [int]$CdpPort = 9275,
  [string]$UserDataDirectory = '',
  [string]$LogPath = '',
  [switch]$UseSourceBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceMain = Join-Path $projectRoot 'code\out\main\index.js'
$exePath = if ($UseSourceBuild) {
  Join-Path $projectRoot 'code\node_modules\electron\dist\electron.exe'
} else {
  (Get-ChildItem -LiteralPath (Join-Path $projectRoot 'outputs') -File | Where-Object { $_.Name -like '*0.1.0.exe' } | Select-Object -First 1).FullName
}
$commandIdentity = if ($UseSourceBuild) { $sourceMain } else { $exePath }
$marker = '--starchat-interaction-test'
if (-not $UserDataDirectory) { $UserDataDirectory = Join-Path $projectRoot 'outputs\debug-userdata-personality-v1' }
if (-not $LogPath) { $LogPath = Join-Path $projectRoot 'outputs\personality-v1-single-instance.json' }

function Get-ProcessSnapshot {
  $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($projectRoot) })
  return @($processes | ForEach-Object {
    [ordered]@{ pid = $_.ProcessId; parentPid = $_.ParentProcessId; name = $_.Name; commandLine = $_.CommandLine }
  })
}

function Get-MatchingRoots {
  @((Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    $_.CommandLine.Contains($marker) -and
    $_.CommandLine.Contains($UserDataDirectory) -and
    $_.CommandLine.Contains("--remote-debugging-port=$CdpPort") -and
     $_.CommandLine.Contains($commandIdentity)
  }))
}

function Get-CdpPages {
  try {
    return @((Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -TimeoutSec 2))
  } catch {
    return @()
  }
}

function Get-HealthyPages {
  @(Get-CdpPages | Where-Object { $_.type -eq 'page' -and $_.url -match '[?&]window=(pet|settings)(?:&|#|$)' -and $_.webSocketDebuggerUrl })
}

function Write-RunLog([string]$event, [object]$extra = $null) {
  $record = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    event = $event
    projectRoot = $projectRoot
    exePath = $exePath
    userDataDirectory = $UserDataDirectory
    cdpPort = $CdpPort
    processSnapshot = @(Get-ProcessSnapshot)
  }
  if ($extra) { $record.details = $extra }
  $directory = Split-Path -Parent $LogPath
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $script:runLog.events = @($script:runLog.events) + [pscustomobject]$record
  $script:runLog.remaining = @(Get-MatchingRoots).Count
  $script:runLog | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $LogPath -Encoding UTF8
}

$script:runLog = [ordered]@{
  schemaVersion = 1
  project = 'Project-008-白音AI助手'
  exePath = $exePath
  commandIdentity = $commandIdentity
  userDataDirectory = $UserDataDirectory
  cdpPort = $CdpPort
  launchCount = 0
  remaining = 0
  events = @()
}
if (Test-Path -LiteralPath $LogPath) {
  try {
    $oldLog = Get-Content -Raw -LiteralPath $LogPath | ConvertFrom-Json
    if ($oldLog.schemaVersion -eq 1) {
      $script:runLog.launchCount = [int]$oldLog.launchCount
      $script:runLog.events = @($oldLog.events)
    }
  } catch {
    # Replace the earlier malformed/nested log with the schema above.
  }
}

if ($Action -eq 'Status') {
  $pages = @(Get-HealthyPages)
  Write-RunLog 'status' @{ healthyPageCount = $pages.Count; pages = $pages | Select-Object type,title,url,webSocketDebuggerUrl }
  $pages | Select-Object type,title,url,webSocketDebuggerUrl | ConvertTo-Json -Depth 5
  exit 0
}

$roots = @(Get-MatchingRoots)
if ($Action -eq 'Stop') {
  if ($roots.Count -gt 1) { throw "Refusing cleanup: multiple matching Project-008 roots found ($($roots.Count))." }
  if ($roots.Count -eq 1) {
    $rootPid = [int]$roots[0].ProcessId
    $all = @(Get-CimInstance Win32_Process)
    $tree = New-Object System.Collections.Generic.HashSet[int]
    [void]$tree.Add($rootPid)
    $changed = $true
    while ($changed) {
      $changed = $false
      foreach ($proc in $all) {
        if ($tree.Contains([int]$proc.ParentProcessId) -and $tree.Add([int]$proc.ProcessId)) { $changed = $true }
      }
    }
    foreach ($processId in @($tree)) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
    Write-RunLog 'stopped' @{ rootPid = $rootPid; stoppedPids = @($tree); remainingMatchingRoots = @(Get-MatchingRoots | Select-Object ProcessId,ParentProcessId,Name) }
  } else {
    Write-RunLog 'stop-noop' @{ remainingMatchingRoots = @() }
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $exePath)) { throw "Latest portable EXE not found: $exePath" }
if ($UseSourceBuild -and -not (Test-Path -LiteralPath $sourceMain)) { throw "Source build entry point not found: $sourceMain" }
$healthy = @(Get-HealthyPages)
if ($healthy.Count -gt 0) {
  Write-RunLog 'reused-healthy-instance' @{ launchCount = 0; pages = $healthy | Select-Object type,title,url }
  $healthy | Select-Object type,title,url | ConvertTo-Json -Depth 5
  exit 0
}
if ($roots.Count -gt 1) { throw "Refusing startup: multiple matching Project-008 roots found ($($roots.Count))." }
if ($roots.Count -eq 1) {
  Write-RunLog 'existing-unhealthy-instance' @{ rootPid = $roots[0].ProcessId }
  throw "A matching Project-008 test instance exists but has no healthy Pet/Settings renderer; refusing to start a second instance."
}

New-Item -ItemType Directory -Force -Path $UserDataDirectory | Out-Null
$arguments = if ($UseSourceBuild) {
  @($sourceMain, "--remote-debugging-port=$CdpPort", "--user-data-dir=$UserDataDirectory", $marker)
} else {
  @("--remote-debugging-port=$CdpPort", "--user-data-dir=$UserDataDirectory", $marker)
}
$process = Start-Process -FilePath $exePath -ArgumentList $arguments -WindowStyle Hidden -PassThru
$launchCount = 1
$script:runLog.launchCount++
$deadline = (Get-Date).AddSeconds(15)
do {
  Start-Sleep -Milliseconds 250
  $healthy = @(Get-HealthyPages)
} while ($healthy.Count -eq 0 -and (Get-Date) -lt $deadline)
if ($healthy.Count -eq 0) {
  Write-RunLog 'start-timeout' @{ launchCount = $launchCount; rootPid = $process.Id }
  throw "Project-008 test instance did not expose a Pet/Settings renderer on CDP $CdpPort."
}
Write-RunLog 'started' @{ launchCount = $launchCount; rootPid = $process.Id; pages = $healthy | Select-Object type,title,url }
$healthy | Select-Object type,title,url | ConvertTo-Json -Depth 5

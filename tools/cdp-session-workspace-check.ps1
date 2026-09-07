param(
  [int]$CdpPort = 9297,
  [ValidateSet('Empty','Seeded','Restarted')][string]$Mode = 'Empty',
  [string]$OutputDirectory = '',
  [switch]$SkipScreenshot
)

$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\session-workspace-gui' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$script:messageId = 0
$script:socket = $null

function Open-SettingsPage {
  $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -TimeoutSec 3
  $page = $pages | Where-Object { $_.type -eq 'page' -and $_.url -match 'window=settings' } | Select-Object -First 1
  if (-not $page) { throw "No settings renderer page on CDP port $CdpPort" }
  $script:socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $script:socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
}

function Invoke-Cdp([string]$Method, [hashtable]$Params = @{}) {
  $script:messageId++
  $id = $script:messageId
  $payload = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $script:socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  do {
    $stream = [IO.MemoryStream]::new()
    do {
      $buffer = New-Object byte[] 65536
      $received = $script:socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      if ($received.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'CDP WebSocket closed' }
      $stream.Write($buffer, 0, $received.Count)
    } while (-not $received.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
  } while ($message.id -ne $id)
  if ($message.error) { throw "CDP error: $($message.error.message)" }
  return $message.result
}

function Evaluate([string]$Expression, [bool]$AwaitPromise = $false) {
  $result = Invoke-Cdp 'Runtime.evaluate' @{ expression = $Expression; returnByValue = $true; awaitPromise = $AwaitPromise }
  if ($result.exceptionDetails) { throw "Runtime evaluation failed: $($result.exceptionDetails.text)" }
  return $result.result.value
}

try {
  Write-Output '[session-check] connecting'
  Open-SettingsPage
  Write-Output '[session-check] connected'
  Invoke-Cdp 'Page.enable' | Out-Null
  Write-Output '[session-check] page-enabled'
  $expression = if ($Mode -eq 'Empty') {
@'
(async () => {
  const snapshot = await window.starchat.sessions.snapshot();
  return JSON.stringify({
    snapshot,
    hasRecoveryAction: Boolean(document.querySelector('.wb-workspace-empty')),
    bodyHasRecoveryText: document.body.innerText.includes('选择工作区'),
    composerDisabled: document.querySelector('.agent-compose-row textarea')?.disabled === true,
    newChatDisabled: document.querySelector('.wb-new-chat')?.disabled === true
  });
})()
'@
  } elseif ($Mode -eq 'Seeded') {
@'
(async () => {
  const before = await window.starchat.sessions.snapshot();
  const workspaceId = before.activeWorkspaceId;
  if (!workspaceId || !before.activeSessionId) throw new Error('Seeded snapshot is missing an active workspace/session');
  const created = await window.starchat.sessions.create(workspaceId);
  const createdId = created.activeSessionId;
  const renamed = await window.starchat.sessions.rename({ sessionId: createdId, title: 'CDP 持久化会话' });
  await window.starchat.sessions.select(before.activeSessionId);
  const final = await window.starchat.sessions.snapshot();
  return JSON.stringify({
    before,
    final,
    createdId,
    renamedPersisted: final.sessions.some((session) => session.id === createdId && session.title === 'CDP 持久化会话'),
    composerEnabled: document.querySelector('.agent-compose-row textarea')?.disabled === false,
    visibleWorkspace: document.body.innerText.includes(final.workspaces[0]?.label ?? '__missing__')
  });
})()
'@
  } else {
@'
(async () => {
  const snapshot = await window.starchat.sessions.snapshot();
  const restored = snapshot.sessions.find((session) => session.id === 'cdp-session-existing');
  return JSON.stringify({
    snapshot,
    restoredMessageCount: restored?.messages.length ?? 0,
    restoredTitle: restored?.title ?? null,
    renamedSessionCount: snapshot.sessions.filter((session) => session.title === 'CDP 持久化会话').length,
    composerEnabled: document.querySelector('.agent-compose-row textarea')?.disabled === false,
    visibleRestoredSession: document.body.innerText.includes('重启恢复会话')
  });
})()
'@
  }
  Write-Output '[session-check] evaluating-state'
  $state = (Evaluate $expression $true) | ConvertFrom-Json
  Write-Output '[session-check] state-ready'
  $screenshotPath = $null
  if (-not $SkipScreenshot) {
    Start-Sleep -Milliseconds 350
    Write-Output '[session-check] capturing'
    $capture = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $false }
    Write-Output '[session-check] captured'
    $screenshotPath = Join-Path $OutputDirectory "session-$($Mode.ToLowerInvariant()).png"
    [IO.File]::WriteAllBytes($screenshotPath, [Convert]::FromBase64String($capture.data))
  }
  $accepted = if ($Mode -eq 'Empty') {
    $state.snapshot.workspaces.Count -eq 0 -and $state.snapshot.sessions.Count -eq 0 -and $state.hasRecoveryAction -and $state.bodyHasRecoveryText -and $state.composerDisabled -and $state.newChatDisabled
  } elseif ($Mode -eq 'Seeded') {
    $state.final.workspaces.Count -ge 1 -and $state.final.sessions.Count -ge 2 -and $state.renamedPersisted -and $state.composerEnabled -and $state.visibleWorkspace
  } else {
    $state.snapshot.workspaces.Count -ge 1 -and $state.restoredMessageCount -eq 2 -and $state.restoredTitle -eq '重启恢复会话' -and $state.renamedSessionCount -ge 1 -and $state.composerEnabled -and $state.visibleRestoredSession
  }
  $report = [ordered]@{ timestamp = (Get-Date).ToString('o'); mode = $Mode; cdpPort = $CdpPort; screenshot = $screenshotPath; state = $state; accepted = $accepted }
  $reportPath = Join-Path $OutputDirectory "session-$($Mode.ToLowerInvariant()).json"
  $report | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  $report | ConvertTo-Json -Depth 16
  if (-not $accepted) { exit 1 }
} finally {
  if ($script:socket) { $script:socket.Dispose() }
}

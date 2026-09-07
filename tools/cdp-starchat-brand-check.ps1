param(
  [int]$CdpPort = 9288,
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\starchat-brand-gui' }
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
  Open-SettingsPage
  Invoke-Cdp 'Page.enable' | Out-Null
  $stateJson = Evaluate @'
(async () => {
  const state = await window.starchat.state.get();
  const brandImage = document.querySelector('[data-workbench="brand-avatar"] img');
  return JSON.stringify({
    title: document.title,
    windowRole: document.documentElement.dataset.starchatWindow,
    hasStarChatBridge: typeof window.starchat === 'object',
    hasLegacyBridge: typeof window.baoyin !== 'undefined',
    activeRoleId: state.role.id,
    roleIds: state.roles.map((role) => role.id),
    brandImage: brandImage?.getAttribute('src') ?? null,
    brandText: document.querySelector('.wb-brand-name')?.textContent?.trim() ?? null,
    bodyHasOldProductName: document.body.innerText.includes('白音 AI 助手') || document.body.innerText.includes('白音AI助手'),
    bodyTextSample: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 500)
  });
})()
'@ $true
  $state = $stateJson | ConvertFrom-Json
  $capture = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $false }
  $screenshotPath = Join-Path $OutputDirectory 'starchat-workbench-live.png'
  [IO.File]::WriteAllBytes($screenshotPath, [Convert]::FromBase64String($capture.data))
  $report = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    cdpPort = $CdpPort
    screenshot = $screenshotPath
    state = $state
    accepted = $state.title -eq 'StarChat' -and
      $state.windowRole -eq 'settings' -and
      $state.hasStarChatBridge -and
      -not $state.hasLegacyBridge -and
      $state.activeRoleId -eq 'starchat.default' -and
      $state.roleIds -contains 'baoyin.default' -and
      $state.brandImage -match 'starchat-brand' -and
      $state.brandText -eq 'StarChat' -and
      -not $state.bodyHasOldProductName
  }
  $reportPath = Join-Path $OutputDirectory 'starchat-brand-gui.json'
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  $report | ConvertTo-Json -Depth 12
  if (-not $report.accepted) { exit 1 }
} finally {
  if ($script:socket) { $script:socket.Dispose() }
}

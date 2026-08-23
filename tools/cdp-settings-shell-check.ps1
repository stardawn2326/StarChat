param(
  [int]$CdpPort = 9275,
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\window-transform-settings-final-20260822' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$script:messageId = 0
$script:socket = $null

function Get-Page([string]$role) {
  $content = (Invoke-WebRequest -Uri "http://127.0.0.1:$CdpPort/json/list" -UseBasicParsing -TimeoutSec 2).Content
  $match = [regex]::Match($content, '(?s)\{.*?"type"\s*:\s*"page".*?"url"\s*:\s*"([^\"]*window=' + [regex]::Escape($role) + '[^\"]*)".*?"webSocketDebuggerUrl"\s*:\s*"([^\"]+)".*?\}')
  if (-not $match.Success) { throw "没有找到 window=$role renderer；脚本不会启动应用。" }
  [pscustomobject]@{ webSocketDebuggerUrl = $match.Groups[2].Value }
}

function Open-Page([string]$role) {
  $page = Get-Page $role
  $script:socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $script:socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Invoke-Cdp([string]$method, [hashtable]$params = @{}) {
  $script:messageId++
  $id = $script:messageId
  $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $send = $script:socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None)
  if (-not $send.Wait(5000)) { throw "CDP send timeout: $method" }
  $send.GetAwaiter().GetResult()
  do {
    $stream = [IO.MemoryStream]::new()
    do {
      $buffer = New-Object byte[] 16384
      $receive = $script:socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None)
      if (-not $receive.Wait(5000)) { throw "CDP receive timeout: $method" }
      $message = $receive.GetAwaiter().GetResult()
      if ($message.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'CDP WebSocket closed.' }
      $stream.Write($buffer, 0, $message.Count)
    } while (-not $message.EndOfMessage)
    $response = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
  } while ($response.id -ne $id)
  $response
}

function Eval([string]$expression) {
  $response = Invoke-Cdp 'Runtime.evaluate' @{ expression = $expression; returnByValue = $true }
  if ($response.result.exceptionDetails) { throw "Runtime.evaluate failed: $($response.result.exceptionDetails.text)" }
  $response.result.result.value
}

function Close-Socket { if ($script:socket) { $script:socket.Dispose(); $script:socket = $null } }

try {
  Open-Page 'settings'
  $state = Eval 'JSON.stringify((()=>{const pick=(selector)=>{const el=document.querySelector(selector);if(!el)return null;const cs=getComputedStyle(el);return {selector,overflowY:cs.overflowY,clientWidth:el.clientWidth,offsetWidth:el.offsetWidth,scrollWidth:el.scrollWidth,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight};};const controls=document.querySelector(".settings-home,.settings-details"),drag=document.querySelector(".drag-region");return {titlebar:!!document.querySelector(".titlebar"),dragRegion:drag?getComputedStyle(drag).webkitAppRegion:null,controlsNoDrag:controls?getComputedStyle(controls).webkitAppRegion:null,viewport:{innerWidth,innerHeight,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth},scrollables:[pick("html"),pick("body"),pick(".settings-center-shell"),pick(".settings-details"),pick(".metric-json")]};})())' | ConvertFrom-Json
  $shot = Join-Path $OutputDirectory 'settings-shell-final.png'
  $image = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png' }
  [IO.File]::WriteAllBytes($shot, [Convert]::FromBase64String($image.result.data))
  $result = [ordered]@{ timestamp = (Get-Date).ToString('o'); evidenceKind = 'CDP settings renderer plus native style probe; not OS drag'; cdpPort = $CdpPort; shell = $state; screenshot = $shot }
  $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'settings-shell-check.json') -Encoding UTF8
  $result | ConvertTo-Json -Depth 20
} finally {
  Close-Socket
}

param(
  [string]$OutputPath = '',
  [ValidateSet('pet', 'settings')][string]$WindowRole = 'pet',
  [switch]$ToggleSettings,
  [switch]$ShowWindow,
  [switch]$HideAfter,
  [int]$CdpPort = 9222,
  [string]$ConfigureModelPath = '',
  [switch]$ConfigureShowWatermark
)

if (-not $OutputPath) {
  $OutputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\live2d-real-transparent-window.png'
}

$jsonResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$CdpPort/json" -UseBasicParsing
$jsonText = [string]$jsonResponse.Content
$targetPattern = '(?s)\{.*?"type"\s*:\s*"page".*?"url"\s*:\s*"[^"]*window=' + [regex]::Escape($WindowRole) + '[^"]*".*?"webSocketDebuggerUrl"\s*:\s*"([^"]+)".*?\}'
$targetMatch = [regex]::Match($jsonText, $targetPattern)
if (-not $targetMatch.Success) {
  throw 'No Electron renderer debug page was found.'
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$script:socketClosed = $false
trap {
  if ($socket -and -not $script:socketClosed) { $socket.Dispose(); $script:socketClosed = $true }
  break
}
$webSocketUrl = $targetMatch.Groups[1].Value
$socket.ConnectAsync([Uri]$webSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$script:messageId = 0

function Invoke-Cdp {
  param(
    [string]$Method,
    [hashtable]$Params = @{}
  )

  $script:messageId++
  $requestId = $script:messageId
  $payload = @{ id = $requestId; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress
  $payloadBytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $socket.SendAsync(
    [ArraySegment[byte]]::new($payloadBytes),
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()

  do {
    $messageStream = [IO.MemoryStream]::new()
    do {
      $buffer = New-Object byte[] 16384
      $receiveCancellation = [Threading.CancellationTokenSource]::new(5000)
      try {
        $receiveTask = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $receiveCancellation.Token)
        if (-not $receiveTask.Wait(5000)) { throw "CDP receive timeout while waiting for $Method" }
        $received = $receiveTask.GetAwaiter().GetResult()
      } finally {
        $receiveCancellation.Dispose()
      }
      if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
        throw 'CDP WebSocket closed.'
      }
      $messageStream.Write($buffer, 0, $received.Count)
    } while (-not $received.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($messageStream.ToArray()) | ConvertFrom-Json
  } while ($message.id -ne $requestId)

  return $message
}

$toggleChecks = @()
if ($ConfigureModelPath) {
  $modelLiteral = $ConfigureModelPath | ConvertTo-Json -Compress
  $watermarkLiteral = if ($ConfigureShowWatermark) { 'true' } else { 'false' }
  $configureExpression = "window.baoyin.settings.save({settings:{live2dModelPath:$modelLiteral,live2dShowWatermark:$watermarkLiteral},licenseAccepted:true}).then(()=>true)"
  $configured = Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = $configureExpression; returnByValue = $true; awaitPromise = $true }
  if ($configured.result.exceptionDetails) {
    throw "Model configuration failed: $($configured.result.exceptionDetails.text)"
  }
  Start-Sleep -Seconds 2
}
if ($ShowWindow) {
  [void](Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = 'window.baoyin.app.showSettings(); true'; returnByValue = $true })
  Start-Sleep -Milliseconds 350
}
if ($ToggleSettings) {
  [void](Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = 'window.baoyin.app.showSettings(); true'; returnByValue = $true })
  Start-Sleep -Milliseconds 350
  $shown = Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = 'window.baoyin.app.visibility()'; returnByValue = $true; awaitPromise = $true }
  $toggleChecks += @{ afterShow = $shown.result.result.value }
  [void](Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = 'window.baoyin.app.hideSettings(); true'; returnByValue = $true })
  Start-Sleep -Milliseconds 350
  $hidden = Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = 'window.baoyin.app.visibility()'; returnByValue = $true; awaitPromise = $true }
  $toggleChecks += @{ afterHide = $hidden.result.result.value }
}

$evaluation = Invoke-Cdp -Method 'Runtime.evaluate' -Params @{
  expression = 'window.baoyin.app.visibility().then(v=>JSON.stringify({title:document.title, url:location.href, body:document.body.innerText, visibility:v, canvases:Array.from(document.querySelectorAll("canvas")).map(c=>{const gl=c.getContext("webgl2");const p=new Uint8Array(4);if(gl){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p)}return {width:c.width,height:c.height,alpha:gl?.getContextAttributes()?.alpha,cornerPixel:Array.from(p)}}), runtimeBadge:document.querySelector(".live2d-runtime-badge")?.textContent, runtimeStatus:document.querySelector(".live2d-overlay small")?.textContent}))'
  returnByValue = $true
  awaitPromise = $true
}
$state = $evaluation.result.result.value | ConvertFrom-Json
$state | Add-Member -NotePropertyName toggleChecks -NotePropertyValue $toggleChecks -Force
$state | ConvertTo-Json -Depth 8

$screenshot = Invoke-Cdp -Method 'Page.captureScreenshot' -Params @{ format = 'png' }
$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[IO.File]::WriteAllBytes($OutputPath, [Convert]::FromBase64String($screenshot.result.data))
Write-Output "screenshot=$OutputPath"

if ($HideAfter) {
  [void](Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = 'window.baoyin.app.hideSettings(); true'; returnByValue = $true })
}

$socket.Dispose()
$script:socketClosed = $true

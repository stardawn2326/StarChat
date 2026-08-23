param(
  [int]$CdpPort = 9275,
  [string]$OutputDirectory = '',
  [string]$ConfigureModelPath = ''
)

$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\personality-v1-gui' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$script:messageId = 0
$script:socket = $null

function Get-Page([string]$targetRole) {
  $jsonContent = (Invoke-WebRequest -Uri "http://127.0.0.1:$CdpPort/json/list" -UseBasicParsing -TimeoutSec 2).Content
  $escapedRole = [regex]::Escape($targetRole)
  $pattern = '(?s)\{.*?"type"\s*:\s*"page".*?"url"\s*:\s*"([^\"]*window=' + $escapedRole + '[^\"]*)".*?"webSocketDebuggerUrl"\s*:\s*"([^\"]+)".*?\}'
  $match = [regex]::Match($jsonContent, $pattern)
  $page = if ($match.Success) { [pscustomobject]@{ type = 'page'; url = $match.Groups[1].Value; webSocketDebuggerUrl = $match.Groups[2].Value } } else { $null }
  if (-not $page) { throw "No renderer page for window=$targetRole on CDP $CdpPort" }
  return $page
}

function Open-Page([string]$role) {
  $page = Get-Page $role
  $script:socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $webSocketUrl = [string]@($page.webSocketDebuggerUrl)[0]
  $script:socket.ConnectAsync([Uri]$webSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  return $page
}

function Invoke-Cdp([string]$method, [hashtable]$params = @{}) {
  $script:messageId++
  $id = $script:messageId
  $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $sendTask = $script:socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None)
  if (-not $sendTask.Wait(5000)) { throw "CDP send timeout: $method" }
  $sendTask.GetAwaiter().GetResult()
  do {
    $stream = [IO.MemoryStream]::new()
    do {
      $buffer = New-Object byte[] 16384
      $receiveTask = $script:socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None)
      if (-not $receiveTask.Wait(5000)) { throw "CDP receive timeout: $method" }
      $received = $receiveTask.GetAwaiter().GetResult()
      if ($received.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'CDP WebSocket closed.' }
      $stream.Write($buffer, 0, $received.Count)
    } while (-not $received.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
  } while ($message.id -ne $id)
  return $message
}

function Eval([string]$expression, [bool]$awaitPromise = $false) {
  $result = Invoke-Cdp 'Runtime.evaluate' @{ expression = $expression; returnByValue = $true; awaitPromise = $awaitPromise }
  if ($result.result.exceptionDetails) { throw "Runtime evaluation failed: $($result.result.exceptionDetails.text)" }
  return $result.result.result.value
}

function Capture([string]$path) {
  $result = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png' }
  [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($result.result.data))
}

function Close-Socket {
  if ($script:socket) { $script:socket.Dispose(); $script:socket = $null }
}

$results = [ordered]@{ timestamp = (Get-Date).ToString('o'); cdpPort = $CdpPort; outputDirectory = $OutputDirectory; settings = @{}; pet = @{}; screenshots = @() }
try {
  Open-Page 'pet' | Out-Null
  $showState = Eval 'window.baoyin.app.showSettings(); window.baoyin.app.visibility()' $true
  Write-Output ("settingsVisibility=" + ($showState | ConvertTo-Json -Compress))
  Close-Socket
  Start-Sleep -Milliseconds 1000
  Open-Page 'settings' | Out-Null
  if ($ConfigureModelPath) {
    $literal = $ConfigureModelPath | ConvertTo-Json -Compress
    Eval "window.baoyin.settings.save({settings:{live2dModelPath:$literal},licenseAccepted:true}).then(()=>true)" $true | Out-Null
    Start-Sleep -Seconds 2
  }
  Eval "history.replaceState({settingsPage:null},'',location.pathname+'?window=settings#home'); window.dispatchEvent(new PopStateEvent('popstate')); true" | Out-Null
  Start-Sleep -Milliseconds 120
  $homeState = Eval 'JSON.stringify({title:document.title,url:location.href,cards:Array.from(document.querySelectorAll(".settings-category-card")).map((node)=>node.innerText.trim()),body:document.body.innerText,dragRegion:getComputedStyle(document.querySelector(".drag-region")).webkitAppRegion,controlsNoDrag:getComputedStyle(document.querySelector(".settings-home")).webkitAppRegion})' | ConvertFrom-Json
  $results.settings.home = $homeState
  $homeShot = Join-Path $OutputDirectory 'settings-home.png'; Capture $homeShot; $results.screenshots += $homeShot
  $pages = @('personality','presentation','composition','window')
  foreach ($page in $pages) {
    $escaped = $page | ConvertTo-Json -Compress
    Eval "document.querySelector('button.settings-category-card:nth-of-type(' + ({personality:1,presentation:2,live2d:3,composition:4,window:5,service:6,data:7,debug:8}[$escaped]) + ')')?.click(); true" | Out-Null
    Start-Sleep -Milliseconds 180
    $details = Eval 'JSON.stringify({page:location.hash,heading:document.querySelector(".detail-header h1")?.textContent,sliders:document.querySelectorAll("input[type=range]").length,textareas:document.querySelectorAll("textarea").length,scrollHeight:document.documentElement.scrollHeight})' | ConvertFrom-Json
    $results.settings[$page] = $details
    $shot = Join-Path $OutputDirectory "settings-$page.png"; Capture $shot; $results.screenshots += $shot
    Eval 'history.back(); true' | Out-Null
    Start-Sleep -Milliseconds 100
  }
  Eval "document.querySelector('button.settings-category-card')?.click(); true" | Out-Null
  Start-Sleep -Milliseconds 120
  Eval "(()=>{const e=document.querySelector('input[type=range]');if(!e)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,'0.66');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()" | Out-Null
  Eval "(()=>{const e=document.querySelector('textarea');if(!e)return false;const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;s.call(e,e.value+'\nGUI probe');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()" | Out-Null
  $results.settings.controlInteraction = Eval 'JSON.stringify({hash:location.hash,rangeValue:document.querySelector("input[type=range]")?.value,textChanged:Array.from(document.querySelectorAll("textarea")).some((node)=>node.value.includes("GUI probe"))})' | ConvertFrom-Json
  Eval "window.baoyin.presentation.emit({type:'action',name:'greet',source:'system',layer:'manual'}); true" | Out-Null
  Start-Sleep -Milliseconds 220
  $results.settings.presentationProbe = Eval 'window.baoyin.debug.metrics().then((value)=>JSON.stringify({activeMotion:value?.activeMotion,activeExpression:value?.activeExpression,parametersWritten:value?.parametersWritten}))' $true | ConvertFrom-Json
  Close-Socket

  $petPage = Get-Page 'pet'; Write-Output ("petUrl=" + $petPage.url)
  Open-Page 'pet' | Out-Null
  Start-Sleep -Seconds 6
  $pet = Eval 'JSON.stringify({url:location.href,role:document.documentElement.dataset.baoyinWindow,modelStatus:document.querySelector("[data-pet-role=pet]")?.dataset.live2dStatus,canvas:Array.from(document.querySelectorAll("canvas")).map((c)=>({width:c.width,height:c.height,cssWidth:getComputedStyle(c).width,cssHeight:getComputedStyle(c).height})),runtime:document.querySelector("[data-live2d-runtime=cubism]")?.dataset.runtimeStatus,frames:document.querySelector("[data-live2d-runtime=cubism]")?.dataset.runtimeRenderFrames,contextLost:document.querySelector("[data-live2d-runtime=cubism]")?.dataset.runtimeContextLost})' | ConvertFrom-Json
  $petResult = [ordered]@{ state = $pet }
  $results.pet = $petResult
  $petShot = Join-Path $OutputDirectory 'pet-renderer.png'; Capture $petShot; $results.screenshots += $petShot
  $petResult.metricsBeforeStop = Eval 'window.baoyin.debug.metrics().then((value)=>JSON.stringify(value))' $true | ConvertFrom-Json
  Close-Socket
  Open-Page 'settings' | Out-Null
  Eval "window.baoyin.debug.command({type:'control',name:'stop_action'}); true" | Out-Null
  Close-Socket
  Open-Page 'pet' | Out-Null
  Start-Sleep -Milliseconds 450
  $petResult.metricsAfterStop = Eval 'window.baoyin.debug.metrics().then((value)=>JSON.stringify(value))' $true | ConvertFrom-Json
} finally {
  Close-Socket
}
$logPath = Join-Path $OutputDirectory 'gui-evidence.json'
$results | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $logPath -Encoding UTF8
$results | ConvertTo-Json -Depth 20

param(
  [int]$CdpPort = 9275,
  [string]$OutputDirectory = '',
  [string]$ConfigureModelPath = '',
  [switch]$ReloadLatest
)

$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\window-transform-cdp-20260822'
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$script:messageId = 0
$script:socket = $null

function Get-Page([string]$targetRole) {
  $content = (Invoke-WebRequest -Uri "http://127.0.0.1:$CdpPort/json/list" -UseBasicParsing -TimeoutSec 2).Content
  $role = [regex]::Escape($targetRole)
  $match = [regex]::Match($content, '(?s)\{.*?"type"\s*:\s*"page".*?"url"\s*:\s*"([^\"]*window=' + $role + '[^\"]*)".*?"webSocketDebuggerUrl"\s*:\s*"([^\"]+)".*?\}')
  if (-not $match.Success) { throw "没有找到 window=$targetRole 的 renderer；脚本不会启动应用。" }
  [pscustomobject]@{ url = $match.Groups[1].Value; webSocketDebuggerUrl = $match.Groups[2].Value }
}

function Open-Page([string]$role) {
  $page = Get-Page $role
  $script:socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $script:socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $page
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

function Eval([string]$expression, [bool]$awaitPromise = $false) {
  $response = Invoke-Cdp 'Runtime.evaluate' @{ expression = $expression; returnByValue = $true; awaitPromise = $awaitPromise }
  if ($response.result.exceptionDetails) { throw "Runtime.evaluate failed: $($response.result.exceptionDetails.text)" }
  $response.result.result.value
}

function Capture([string]$path) {
  $response = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png' }
  [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($response.result.data))
}

function Close-Socket {
  if ($script:socket) { $script:socket.Dispose(); $script:socket = $null }
}

function Sample-Pet {
  Eval '(async()=>{const root=document.querySelector("[data-pet-role=pet]"),c=document.querySelector("[data-live2d-canvas]"),r=c?.getBoundingClientRect(),m=document.querySelector("[data-live2d-runtime=cubism]"),bounds=await window.starchat.pet.bounds();return {bounds,modelScale:root?.dataset.modelScale,modelOffsetX:root?.dataset.modelOffsetX,modelOffsetY:root?.dataset.modelOffsetY,canvas:{width:c?.width,height:c?.height,cssWidth:getComputedStyle(c).width,cssHeight:getComputedStyle(c).height,clientWidth:c?.clientWidth,clientHeight:c?.clientHeight,viewportCss:c?.dataset.viewportCss,renderScale:c?.dataset.renderScale,left:r?.left,top:r?.top},transform:m?.dataset.runtimeTransform,matrix:m?.dataset.runtimeModelMatrix,status:root?.dataset.live2dStatus}})()' $true
}

$results = [ordered]@{
  timestamp = (Get-Date).ToString('o')
  evidenceKind = 'CDP renderer probe; not OS mouse or visual acceptance'
  cdpPort = $CdpPort
  startedApplication = $false
  samples = @()
  screenshots = @()
  gestures = @{}
  scaleSamples = @()
  pass = $false
}

try {
  if ($ConfigureModelPath) {
    Open-Page 'settings' | Out-Null
    $modelLiteral = $ConfigureModelPath | ConvertTo-Json -Compress
    Eval "window.starchat.settings.save({settings:{live2dModelPath:$modelLiteral,modelViewportByModel:{}},licenseAccepted:true}).then(()=>true)" $true | Out-Null
    Start-Sleep -Seconds 5
    Close-Socket
  }
  Open-Page 'pet' | Out-Null
  if ($ReloadLatest) {
    Invoke-Cdp 'Page.reload' @{ ignoreCache = $true } | Out-Null
    Start-Sleep -Seconds 5
  }
  Start-Sleep -Milliseconds 1500
  $baseline = Sample-Pet
  $initialViewportMapJson = Eval '(async()=>JSON.stringify((await window.starchat.state.get()).settings.modelViewportByModel))()' $true
  $results.samples += [ordered]@{ label = 'baseline'; value = $baseline }
  Close-Socket

  Open-Page 'settings' | Out-Null
  $baseBounds = $baseline.bounds
  $sizes = @(
    @{ label = 'small'; width = 380; height = 520 },
    @{ label = 'medium'; width = 520; height = 700 },
    @{ label = 'large'; width = 700; height = 880 }
  )
  foreach ($size in $sizes) {
    $next = @{ x = [int]$baseBounds.x; y = [int]$baseBounds.y; width = [int]$size.width; height = [int]$size.height } | ConvertTo-Json -Compress
    Eval "window.starchat.pet.previewBounds($next); true" | Out-Null
    Eval 'new Promise(resolve=>setTimeout(()=>resolve(true),350))' $true | Out-Null
    Close-Socket
    Open-Page 'pet' | Out-Null
    $sample = Sample-Pet
    $shot = Join-Path $OutputDirectory "pet-$($size.label).png"
    Capture $shot
    $results.screenshots += $shot
    $results.samples += [ordered]@{ label = $size.label; requested = $size; value = $sample }
    Close-Socket
    Open-Page 'settings' | Out-Null
  }

  # CDP dispatches renderer pointer events for deterministic gesture coverage;
  # this is not a substitute for OS-level mouse/desktop click-through evidence.
  Close-Socket
  Open-Page 'pet' | Out-Null
  $wasEditing = [bool](Eval 'document.querySelector("[data-pet-role=pet]")?.dataset.petModelEditMode === "true"')
  if (-not $wasEditing) {
    Eval 'window.starchat.app.toggleModelEdit(); true' | Out-Null
    Start-Sleep -Milliseconds 250
  }
  $holdBefore = Sample-Pet
  Eval '(()=>{const c=document.querySelector("[data-live2d-canvas]");c.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,pointerId:31,screenX:100,screenY:100,clientX:100,clientY:100}));return true})()' | Out-Null
  Start-Sleep -Seconds 5
  $holdDuring = Sample-Pet
  Eval '(()=>{const c=document.querySelector("[data-live2d-canvas]");c.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,button:0,pointerId:31,screenX:100,screenY:100,clientX:100,clientY:100}));return true})()' | Out-Null
  Start-Sleep -Milliseconds 150

  $horizontalBefore = Sample-Pet
  Eval '(()=>{const c=document.querySelector("[data-live2d-canvas]");c.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,pointerId:32,screenX:100,screenY:100,clientX:100,clientY:100}));c.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,cancelable:true,pointerId:32,screenX:160,screenY:100,clientX:160,clientY:100}));c.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,button:0,pointerId:32,screenX:160,screenY:100,clientX:160,clientY:100}));return true})()' | Out-Null
  Start-Sleep -Milliseconds 220
  $horizontalAfter = Sample-Pet

  $verticalBefore = Sample-Pet
  Eval '(()=>{const c=document.querySelector("[data-live2d-canvas]");c.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,pointerId:33,screenX:100,screenY:100,clientX:100,clientY:100}));c.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,cancelable:true,pointerId:33,screenX:100,screenY:150,clientX:100,clientY:150}));c.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,button:0,pointerId:33,screenX:100,screenY:150,clientX:100,clientY:150}));return true})()' | Out-Null
  Start-Sleep -Milliseconds 220
  $verticalAfter = Sample-Pet

  $wheelBefore = Sample-Pet
  Eval '(()=>{const c=document.querySelector("[data-live2d-canvas]");c.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:-100}));return true})()' | Out-Null
  Start-Sleep -Milliseconds 220
  $wheelAfter = Sample-Pet
  $results.gestures = [ordered]@{
    evidenceKind = 'CDP-dispatched renderer events; not OS mouse'
    holdFiveSecondsScaleStable = ($holdBefore.modelScale -eq $holdDuring.modelScale)
    horizontalDrag = [ordered]@{ before = $horizontalBefore; after = $horizontalAfter; xChanged = ($horizontalBefore.modelOffsetX -ne $horizontalAfter.modelOffsetX); yStable = ($horizontalBefore.modelOffsetY -eq $horizontalAfter.modelOffsetY); scaleStable = ($horizontalBefore.modelScale -eq $horizontalAfter.modelScale) }
    verticalDrag = [ordered]@{ before = $verticalBefore; after = $verticalAfter; xStable = ($verticalBefore.modelOffsetX -eq $verticalAfter.modelOffsetX); yChanged = ($verticalBefore.modelOffsetY -ne $verticalAfter.modelOffsetY); scaleStable = ($verticalBefore.modelScale -eq $verticalAfter.modelScale) }
    wheel = [ordered]@{ before = $wheelBefore; after = $wheelAfter; xStable = ($wheelBefore.modelOffsetX -eq $wheelAfter.modelOffsetX); yStable = ($wheelBefore.modelOffsetY -eq $wheelAfter.modelOffsetY); scaleChanged = ($wheelBefore.modelScale -ne $wheelAfter.modelScale) }
  }
  foreach ($scale in @(0.55, 1.0, 2.4)) {
    Eval "(async()=>{const s=await window.starchat.state.get();const key=Object.keys(s.settings.modelViewportByModel)[0];const map={...s.settings.modelViewportByModel,[key]:{...s.settings.modelViewportByModel[key],modelScale:$scale}};await window.starchat.settings.save({settings:{modelViewportByModel:map}});return true})()" $true | Out-Null
    Start-Sleep -Milliseconds 450
    $scaleSample = Sample-Pet
    $scaleShot = Join-Path $OutputDirectory "pet-scale-$($scale.ToString('0.00')).png"
    Capture $scaleShot
    $results.screenshots += $scaleShot
    $results.scaleSamples += [ordered]@{ requested = $scale; value = $scaleSample; screenshot = $scaleShot }
  }
  Eval "window.starchat.settings.save({settings:{modelViewportByModel:$initialViewportMapJson}}).then(()=>true)" $true | Out-Null
  Start-Sleep -Milliseconds 300
  if (-not $wasEditing) {
    Eval 'window.starchat.app.toggleModelEdit(); true' | Out-Null
    Start-Sleep -Milliseconds 250
  }
  $gestureShot = Join-Path $OutputDirectory 'pet-gesture-regression.png'
  Capture $gestureShot
  $results.screenshots += $gestureShot
  Close-Socket
  Open-Page 'settings' | Out-Null
  $restore = $baseBounds | ConvertTo-Json -Compress
  Eval "window.starchat.pet.previewBounds($restore); true" | Out-Null
  Eval 'new Promise(resolve=>setTimeout(()=>resolve(true),350))' $true | Out-Null
  Close-Socket

  $samples = @($results.samples | ForEach-Object { $_.value })
  $canvasFollowsViewport = $true
  $matrixStableOnResize = $true
  $sameModel = $true
  foreach ($sample in $samples) {
    if ([Math]::Abs([double]$sample.canvas.clientWidth - [double]$sample.bounds.width) -gt 2 -or [Math]::Abs([double]$sample.canvas.clientHeight - [double]$sample.bounds.height) -gt 2) { $canvasFollowsViewport = $false }
    if ($sample.matrix -ne $samples[0].matrix) { $matrixStableOnResize = $false }
    if ($sample.modelScale -ne $samples[0].modelScale -or $sample.modelOffsetX -ne $samples[0].modelOffsetX -or $sample.modelOffsetY -ne $samples[0].modelOffsetY) { $sameModel = $false }
  }
  $gesturePass = $results.gestures.holdFiveSecondsScaleStable -and
    $results.gestures.horizontalDrag.xChanged -and $results.gestures.horizontalDrag.yStable -and $results.gestures.horizontalDrag.scaleStable -and
    $results.gestures.verticalDrag.xStable -and $results.gestures.verticalDrag.yChanged -and $results.gestures.verticalDrag.scaleStable -and
    $results.gestures.wheel.xStable -and $results.gestures.wheel.yStable -and $results.gestures.wheel.scaleChanged
  $scaleValues = @($results.scaleSamples | ForEach-Object { [double]$_.value.modelScale })
  $scaleMonotonic = $scaleValues.Count -eq 3 -and $scaleValues[0] -lt $scaleValues[1] -and $scaleValues[1] -lt $scaleValues[2]
  $results.assertions = [ordered]@{ canvasFollowsViewport = $canvasFollowsViewport; matrixStableOnResize = $matrixStableOnResize; modelConfigStable = $sameModel; gestureInvariants = $gesturePass; scaleMinMidMaxMonotonic = $scaleMonotonic; windowSizesTested = 3 }
  $results.pass = $canvasFollowsViewport -and $matrixStableOnResize -and $sameModel -and $gesturePass -and $scaleMonotonic
} finally {
  Close-Socket
}

$logPath = Join-Path $OutputDirectory 'window-transform-cdp.json'
$results | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $logPath -Encoding UTF8
$results | ConvertTo-Json -Depth 30
if (-not $results.pass) { exit 2 }

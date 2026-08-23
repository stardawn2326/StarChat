param(
  [string]$OutputDirectory = '',
  [int]$SoakSeconds = 0,
  [int]$CdpPort = 9222,
  [switch]$ForceInteractive,
  [switch]$ModelViewportEdit
)

$ErrorActionPreference = 'Stop'

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\cursor-interaction-2026-08-21'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies @('System.Drawing', 'System.Drawing.Common', 'System.Private.Windows.GdiPlus', 'System.Private.Windows.Core') @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
public static class CursorProbe {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X; public int Y; }
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);
  [DllImport("user32.dll")] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] private static extern int GetWindowLong32(IntPtr hWnd, int index);
  [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  public const uint LEFTDOWN = 0x0002; public const uint LEFTUP = 0x0004; public const uint WHEEL = 0x0800;
  private static IntPtr GetWindowLongPtr(IntPtr hWnd, int index) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : new IntPtr(GetWindowLong32(hWnd, index));
  }
  private static IntPtr FindTitle(string title) {
    IntPtr found = IntPtr.Zero;
  EnumWindows(delegate(IntPtr h, IntPtr extra) {
      if (!IsWindowVisible(h)) return true;
      RECT windowRect; if (!GetWindowRect(h, out windowRect) || windowRect.Right <= windowRect.Left || windowRect.Bottom <= windowRect.Top) return true;
      var text = new StringBuilder(256); GetWindowText(h, text, text.Capacity);
      if (text.ToString() == title) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string ForegroundTitle() { var h = GetForegroundWindow(); var text = new StringBuilder(256); GetWindowText(h, text, text.Capacity); return text.ToString(); }
  public static string ContentRectJson(string title) {
    var h = FindTitle(title); if (h == IntPtr.Zero) return "null";
    RECT client; POINT origin = new POINT(); if (!GetClientRect(h, out client) || !ClientToScreen(h, ref origin)) return "null";
    return string.Format("{{\"left\":{0},\"top\":{1},\"right\":{2},\"bottom\":{3}}}", origin.X, origin.Y, origin.X + client.Right - client.Left, origin.Y + client.Bottom - client.Top);
  }
  public static bool FocusTitle(string title) { var h = FindTitle(title); return h != IntPtr.Zero && SetForegroundWindow(h); }
  public static bool PrintWindowPng(string title, int left, int top, int right, int bottom, string path) {
    IntPtr h = IntPtr.Zero;
    EnumWindows(delegate(IntPtr candidate, IntPtr extra) {
      if (!IsWindowVisible(candidate)) return true;
      var text = new StringBuilder(256); GetWindowText(candidate, text, text.Capacity);
      RECT r; GetWindowRect(candidate, out r);
      if (text.ToString() == title && Math.Abs(r.Left-left) <= 4 && Math.Abs(r.Top-top) <= 4 && Math.Abs(r.Right-right) <= 4 && Math.Abs(r.Bottom-bottom) <= 4) { h = candidate; return false; }
      return true;
    }, IntPtr.Zero);
    if (h == IntPtr.Zero) return false;
    RECT rect; if (!GetWindowRect(h, out rect)) return false;
    using (var bitmap = new Bitmap(Math.Max(1, rect.Right-rect.Left), Math.Max(1, rect.Bottom-rect.Top), PixelFormat.Format32bppArgb))
    using (var graphics = Graphics.FromImage(bitmap)) {
      IntPtr dc = graphics.GetHdc(); bool ok = PrintWindow(h, dc, 2); graphics.ReleaseHdc(dc);
      if (!ok) return false;
      bitmap.Save(path, ImageFormat.Png); return true;
    }
  }
  public static string StyleJson(string title, int left, int top, int right, int bottom) {
    IntPtr h = FindTitle(title); long style = 0, ex = 0;
    if (h == IntPtr.Zero) {
      var expectedX = (left + right) / 2.0; var expectedY = (top + bottom) / 2.0;
      EnumWindows(delegate(IntPtr candidate, IntPtr extra) {
        if (!IsWindowVisible(candidate)) return true;
        RECT r; if (!GetWindowRect(candidate, out r)) return true;
        var candidateStyle = (long)GetWindowLongPtr(candidate, -16); var candidateEx = (long)GetWindowLongPtr(candidate, -20);
        var centerX = (r.Left + r.Right) / 2.0; var centerY = (r.Top + r.Bottom) / 2.0;
        if ((candidateEx & 0x00080000) != 0 && (candidateStyle & 0x00C00000) == 0 && Math.Abs(centerX - expectedX) <= 180 && Math.Abs(centerY - expectedY) <= 180) { h = candidate; return false; }
        return true;
      }, IntPtr.Zero);
    }
    if (h == IntPtr.Zero) return "null";
    style = (long)GetWindowLongPtr(h, -16); ex = (long)GetWindowLongPtr(h, -20);
    return string.Format("{{\"style\":\"0x{0:X}\",\"exStyle\":\"0x{1:X}\",\"hasCaption\":{2},\"layered\":{3},\"toolWindow\":{4},\"appWindow\":{5},\"taskbarExcluded\":{6}}}", style, ex, (style & 0x00C00000) != 0 ? "true" : "false", (ex & 0x00080000) != 0 ? "true" : "false", (ex & 0x00000080) != 0 ? "true" : "false", (ex & 0x00040000) != 0 ? "true" : "false", (ex & 0x00040000) == 0 ? "true" : "false");
  }
  public static string DebugWindows() {
    var result = new StringBuilder();
    EnumWindows(delegate(IntPtr h, IntPtr extra) { var title = new StringBuilder(128); GetWindowText(h, title, title.Capacity); RECT r; if (IsWindowVisible(h) && GetWindowRect(h, out r)) result.AppendFormat("{0}:{1},{2},{3},{4};", title, r.Left, r.Top, r.Right, r.Bottom); return true; }, IntPtr.Zero);
    return result.ToString();
  }
  public static void Wheel(int delta) { mouse_event(WHEEL, 0, 0, (uint)delta, UIntPtr.Zero); }
}
'@

$targets = (Invoke-WebRequest -Uri "http://127.0.0.1:$CdpPort/json" -UseBasicParsing).Content | ConvertFrom-Json
$targetItems = @($targets)
$petCandidates = @()
foreach ($item in $targetItems) {
  if ([string]$item.type -eq 'page' -and ([string]$item.url) -match '[?&]window=pet(?:&|$)') {
    $petCandidates += $item
  }
}
if ($petCandidates.Count -eq 0) { throw "No PetWindow renderer page found on CDP port $CdpPort." }

$script:socket = $null
$script:messageId = 0

function Invoke-Cdp {
  param([string]$Method, [hashtable]$Params = @{})
  $script:messageId++
  $id = $script:messageId
  $payload = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  [void]$script:socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  do {
    $stream = [IO.MemoryStream]::new()
    do {
      $buffer = New-Object byte[] 16384
      $received = $script:socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      if ($received.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'CDP WebSocket closed.' }
      [void]$stream.Write($buffer, 0, $received.Count)
    } while (-not $received.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
  } while ($message.id -ne $id)
  if ($message.error) { throw "CDP $Method failed: $($message.error.message)" }
  return $message
}

function Evaluate([string]$Expression) {
  $result = Invoke-Cdp -Method 'Runtime.evaluate' -Params @{ expression = $Expression; returnByValue = $true; awaitPromise = $true }
  if ($result.result.exceptionDetails) { throw "Pet renderer evaluation failed: $($result.result.exceptionDetails.text)" }
  return $result.result.result.value
}

$target = $null
foreach ($candidate in $petCandidates) {
  $candidateSocket = [System.Net.WebSockets.ClientWebSocket]::new()
  try {
    $candidateWebSocketUrl = [string]$candidate.webSocketDebuggerUrl
    Write-Output "candidate-ws=$candidateWebSocketUrl"
    [void]$candidateSocket.ConnectAsync([Uri]$candidateWebSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $script:socket = $candidateSocket
    $script:messageId = 0
    $markerRaw = Evaluate 'JSON.stringify({role:document.body?.dataset?.window ?? null,pet:!!document.querySelector("[data-pet-role=pet]"),canvas:!!document.querySelector("[data-live2d-canvas]")})'
    Write-Output "candidate-marker=$markerRaw"
    $marker = $markerRaw | ConvertFrom-Json
    if ($marker.role -eq 'pet' -and $marker.pet) {
      $target = $candidate
      break
    }
    $candidateSocket.Dispose()
    $script:socket = $null
  } catch {
    Write-Output "candidate-error=$($_.Exception.Message)"
    $candidateSocket.Dispose()
    $script:socket = $null
  }
}
if (-not $target) {
  throw 'PetWindow URL exists, but no candidate exposed the Pet DOM marker. Refusing to capture an empty or wrong renderer page.'
}
Write-Output "connected=$($target.url)"

function ReadPetState {
  $json = Evaluate '(async()=>JSON.stringify({url:location.href,title:document.title,ready:document.readyState,role:document.body?.dataset?.window,pet:document.querySelector("[data-pet-role=pet]")?.dataset,canvas:Array.from(document.querySelectorAll("canvas")).map(c=>{const gl=c.getContext("webgl2");const p=new Uint8Array(4);let nonzero=0,maxAlpha=0;if(gl){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);const grid=new Uint8Array(100*100*4);gl.readPixels(0,0,100,100,gl.RGBA,gl.UNSIGNED_BYTE,grid);for(let i=3;i<grid.length;i+=4){if(grid[i]>0)nonzero++;if(grid[i]>maxAlpha)maxAlpha=grid[i]}}return {width:c.width,height:c.height,alpha:gl?.getContextAttributes()?.alpha,cornerPixel:Array.from(p),gridNonzeroAlphaPixels:nonzero,maxAlpha,contextLost:gl?.isContextLost?.(),glError:gl?.getError?.()}}),runtime:document.querySelector("[data-live2d-runtime]")?.dataset,visibility:await window.baoyin.app.visibility(),state:await window.baoyin.state.get()}))()'
  return $json | ConvertFrom-Json
}

function GetPetRect {
  $raw = Evaluate 'window.baoyin.pet.bounds().then(JSON.stringify)'
  if (-not $raw) { throw 'window.baoyin.pet.bounds() returned no bounds.' }
  $bounds = $raw | ConvertFrom-Json
  return [pscustomobject]@{ left = $bounds.x; top = $bounds.y; right = $bounds.x + $bounds.width; bottom = $bounds.y + $bounds.height }
}

function ReadPetGeometry {
  $raw = Evaluate 'JSON.stringify((()=>{const rectOf=(node)=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom}};const root=document.querySelector("[data-pet-role=pet]");const card=document.querySelector("[data-live2d-runtime]");const canvas=document.querySelector("[data-live2d-canvas]");const cs=canvas?getComputedStyle(canvas):null;return {root:rectOf(root),card:rectOf(card),canvas:rectOf(canvas),canvasPixels:canvas?{width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight}:null,canvasStyle:cs?{transform:cs.transform,transformOrigin:cs.transformOrigin,boxSizing:cs.boxSizing,width:cs.width,height:cs.height}:null,rootStyle:root?{boxSizing:getComputedStyle(root).boxSizing,overflow:getComputedStyle(root).overflow}:null}})())'
  return $raw | ConvertFrom-Json
}

function GetPngPixelMetrics([string]$Path) {
  $bitmap = [Drawing.Bitmap]::new($Path)
  $imageWidth = $bitmap.Width
  $imageHeight = $bitmap.Height
  $margin = 8
  $alphaPixels = 0
  $minX = $imageWidth; $minY = $imageHeight; $maxX = -1; $maxY = -1
  for ($y = $margin; $y -lt ($imageHeight - $margin); $y++) {
    for ($x = $margin; $x -lt ($imageWidth - $margin); $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      if ($pixel.A -gt 8) {
        $alphaPixels++
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  $bitmap.Dispose()
  return [ordered]@{
    width = $imageWidth
    height = $imageHeight
    innerMargin = $margin
    alphaPixels = $alphaPixels
    alphaBoundingBox = if ($maxX -ge 0) { [ordered]@{ left = $minX; top = $minY; right = $maxX; bottom = $maxY; width = $maxX - $minX + 1; height = $maxY - $minY + 1 } } else { $null }
  }
}

function CompareStableGeometry($baseline, $candidate) {
  $rectDelta = [Math]::Max(
    [Math]::Max([Math]::Abs($baseline.root.width - $candidate.root.width), [Math]::Abs($baseline.root.height - $candidate.root.height)),
    [Math]::Max([Math]::Abs($baseline.canvas.width - $candidate.canvas.width), [Math]::Abs($baseline.canvas.height - $candidate.canvas.height))
  )
  $canvasPixelDelta = [Math]::Max(
    [Math]::Abs($baseline.canvasPixels.width - $candidate.canvasPixels.width),
    [Math]::Abs($baseline.canvasPixels.height - $candidate.canvasPixels.height)
  )
  $pixelDelta = if ($baseline.pixelMetrics.alphaPixels -gt 0) { [Math]::Abs($candidate.pixelMetrics.alphaPixels - $baseline.pixelMetrics.alphaPixels) / [double]$baseline.pixelMetrics.alphaPixels } else { 1 }
  return [ordered]@{ rootAndCanvasMaxDeltaPx = $rectDelta; canvasPixelDimensionDeltaPx = $canvasPixelDelta; pixelAlphaRelativeDelta = $pixelDelta; pass = $rectDelta -le 1 -and $canvasPixelDelta -eq 0 -and $pixelDelta -le 0.1 }
}

function Capture([string]$Name, [string]$Phase) {
  $path = Join-Path $OutputDirectory "$Name.png"
  $captureRect = GetPetRect
  $rendererCapture = CaptureRenderer $Name
  $rendererPath = $rendererCapture.path
  $width = [Math]::Max(1, $captureRect.right - $captureRect.left)
  $height = [Math]::Max(1, $captureRect.bottom - $captureRect.top)
  $bitmap = New-Object Drawing.Bitmap $width, $height
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($captureRect.left, $captureRect.top, 0, 0, $bitmap.Size)
  $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
  $nativePath = Join-Path $OutputDirectory "$Name-native.png"
  $nativeCaptured = [CursorProbe]::PrintWindowPng('白音 AI 助手', $captureRect.left, $captureRect.top, $captureRect.right, $captureRect.bottom, $nativePath)
  return [ordered]@{ phase = $Phase; screenshot = $path; rendererScreenshot = $rendererPath; rendererPixelMetrics = $rendererCapture.pixelMetrics; geometry = ReadPetGeometry; nativeScreenshot = if ($nativeCaptured) { $nativePath } else { $null }; petRect = $captureRect; foregroundTitle = [CursorProbe]::ForegroundTitle(); state = ReadPetState }
}

function CaptureRenderer([string]$Name) {
  [void](Evaluate 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
  Start-Sleep -Milliseconds 50
  $response = Invoke-Cdp -Method 'Page.captureScreenshot' -Params @{ format = 'png'; fromSurface = $true }
  $bytes = [Convert]::FromBase64String([string]$response.result.data)
  $path = Join-Path $OutputDirectory "$Name-renderer.png"
  [IO.File]::WriteAllBytes($path, $bytes)
  return [ordered]@{ path = $path; pixelMetrics = GetPngPixelMetrics $path }
}

function ResetClickTarget {
  $clickCandidate = @($targetItems | Where-Object { [string]$_.type -eq 'page' -and ([string]$_.title) -match '^BAOYIN_CLICK_TARGET(?:_CLICKED)?$' }) | Select-Object -First 1
  if (-not $clickCandidate) { return $false }
  $petSocket = $script:socket
  $clickSocket = [System.Net.WebSockets.ClientWebSocket]::new()
  try {
    [void]$clickSocket.ConnectAsync([Uri]$clickCandidate.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $script:socket = $clickSocket
    $script:messageId = 0
    [void](Evaluate "document.title='BAOYIN_CLICK_TARGET'; document.body.dataset.clicked='false'; document.getElementById('status').textContent='NOT_CLICKED'; true")
    return $true
  } finally {
    $clickSocket.Dispose()
    $script:socket = $petSocket
    $script:messageId = 0
  }
}

function ClickTargetWasClicked {
  try {
    $latest = (Invoke-WebRequest -Uri "http://127.0.0.1:$CdpPort/json" -UseBasicParsing).Content | ConvertFrom-Json
    return @($latest | Where-Object { [string]$_.type -eq 'page' -and [string]$_.title -eq 'BAOYIN_CLICK_TARGET_CLICKED' }).Count -gt 0
  } catch {
    return $false
  }
}

$markerState = ReadPetState
if (-not $markerState.canvas) { throw "Pet DOM mounted but canvas is absent. state=$($markerState | ConvertTo-Json -Depth 6 -Compress)" }
$original = $markerState.state.settings
[void](Evaluate 'window.baoyin.pet.show(); window.baoyin.pet.center(); true')
if ($ForceInteractive) {
  [void](Evaluate 'window.baoyin.app.setInputMode("interactive"); true')
}
Write-Output 'pet-shown-and-centered'
Start-Sleep -Milliseconds 1200
$directCapture = CaptureRenderer 'pet-renderer-direct'
$rendererScreenshot = $directCapture.path
$directGeometry = ReadPetGeometry
$directPixelMetrics = $directCapture.pixelMetrics
$rect = GetPetRect
$nativeStyle = [CursorProbe]::StyleJson('白音 AI 助手', $rect.left, $rect.top, $rect.right, $rect.bottom) | ConvertFrom-Json
$positions = @(
  @{ name = 'cursor-left'; x = $rect.left + 20; y = [int](($rect.top + $rect.bottom) / 2) },
  @{ name = 'cursor-center'; x = [int](($rect.left + $rect.right) / 2); y = [int](($rect.top + $rect.bottom) / 2) },
  @{ name = 'cursor-right'; x = $rect.right - 20; y = [int](($rect.top + $rect.bottom) / 2) }
)
  $frames = @()
foreach ($position in $positions) {
  [void][CursorProbe]::SetCursorPos($position.x, $position.y)
  Start-Sleep -Milliseconds 800
  $frames += Capture $position.name 'moving gaze'
}
Start-Sleep -Milliseconds 4500
$frames += Capture 'cursor-idle-after-4s' 'idle gaze after 4 seconds'
[void][CursorProbe]::SetCursorPos($positions[1].x, $positions[1].y)
Start-Sleep -Milliseconds 800
$frames += Capture 'cursor-reacquired' 'tracking reacquired'
[void][CursorProbe]::SetCursorPos($rect.left + 5, $rect.top + 5)
Start-Sleep -Milliseconds 700
$frames += Capture 'cursor-away-after-fade' 'moved away after hover fade delay'

$modelViewportFrames = @()
if ($ModelViewportEdit) {
  [void](Evaluate 'window.baoyin.app.toggleModelEdit(); true')
  Start-Sleep -Milliseconds 700
  $modelViewportFrames += Capture 'model-editor-before' 'model viewport editor before change'

  $editX = [int](($rect.left + $rect.right) / 2)
  $editY = [int](($rect.top + $rect.bottom) / 2)
  [void][CursorProbe]::SetCursorPos($editX, $editY)
  Start-Sleep -Milliseconds 150
  [CursorProbe]::mouse_event([CursorProbe]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  [void][CursorProbe]::SetCursorPos($editX + 70, $editY - 24)
  Start-Sleep -Milliseconds 250
  [CursorProbe]::mouse_event([CursorProbe]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 700
  $modelViewportFrames += Capture 'model-editor-moved' 'model viewport moved by drag'

  [void][CursorProbe]::SetCursorPos($editX + 70, $editY - 24)
  [CursorProbe]::mouse_event([CursorProbe]::WHEEL, 0, 0, 240, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 700
  $modelViewportFrames += Capture 'model-editor-zoomed' 'model viewport zoomed by wheel'

  [void](Evaluate 'window.baoyin.app.toggleModelEdit(); true')
  Start-Sleep -Milliseconds 700
  $modelViewportFrames += Capture 'model-editor-exited' 'model viewport editor exited'
}

[void](ResetClickTarget)
$targetRectRaw = [CursorProbe]::ContentRectJson('BAOYIN_CLICK_TARGET')
if (-not $targetRectRaw -or $targetRectRaw -eq 'null') {
  $targetRectRaw = [CursorProbe]::ContentRectJson('BAOYIN_CLICK_TARGET_CLICKED')
}
if (-not $targetRectRaw -or $targetRectRaw -eq 'null' -or (($targetRectRaw | ConvertFrom-Json).right -le ($targetRectRaw | ConvertFrom-Json).left)) {
  $targetRectRaw = (GetPetRect | ConvertTo-Json -Compress)
}
$clickProbe = [ordered]@{ status = 'not_run'; targetRect = $null; targetClicked = $false; beforeTitle = [CursorProbe]::ForegroundTitle(); afterTitle = [CursorProbe]::ForegroundTitle() }
if ($targetRectRaw -and $targetRectRaw -ne 'null') {
  $targetRect = $targetRectRaw | ConvertFrom-Json
  $clickProbe.targetRect = $targetRect
  [void][CursorProbe]::FocusTitle('BAOYIN_CLICK_TARGET')
  Start-Sleep -Milliseconds 250
  $clickX = $targetRect.left + 55
  $clickY = $targetRect.top + 55
  [void][CursorProbe]::SetCursorPos($clickX, $clickY)
  Start-Sleep -Milliseconds 250
  $clickProbe.beforeTitle = [CursorProbe]::ForegroundTitle()
  [CursorProbe]::mouse_event([CursorProbe]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  [CursorProbe]::mouse_event([CursorProbe]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 500
  $clickProbe.afterTitle = [CursorProbe]::ForegroundTitle()
  $clickProbe.targetClicked = ClickTargetWasClicked
  $clickProbe.status = if ($clickProbe.targetClicked) { 'passed' } else { 'failed' }
} else {
  $clickProbe.status = 'test_target_not_present'
}
$frames += Capture 'click-through-corner' 'transparent corner click probe'

$hoverFrame = @($frames | Where-Object { $_.state.pet.petHovered -eq 'true' -or $_.state.pet.petHovered -eq $true }) | Select-Object -First 1
$awayFrame = @($frames | Where-Object { $_.phase -eq 'moved away after hover fade delay' }) | Select-Object -First 1
$threeStateCheck = [ordered]@{
  normal = [ordered]@{ geometry = $directGeometry; pixelMetrics = $directPixelMetrics }
  hover = if ($hoverFrame) { [ordered]@{ geometry = $hoverFrame.geometry; pixelMetrics = $hoverFrame.rendererPixelMetrics; state = $hoverFrame.state.pet } } else { $null }
  awayAfterFade = if ($awayFrame) { [ordered]@{ geometry = $awayFrame.geometry; pixelMetrics = $awayFrame.rendererPixelMetrics; state = $awayFrame.state.pet } } else { $null }
  normalToHover = if ($hoverFrame) { CompareStableGeometry ([pscustomobject]@{ root = $directGeometry.root; canvas = $directGeometry.canvas; canvasPixels = $directGeometry.canvasPixels; pixelMetrics = $directPixelMetrics }) ([pscustomobject]@{ root = $hoverFrame.geometry.root; canvas = $hoverFrame.geometry.canvas; canvasPixels = $hoverFrame.geometry.canvasPixels; pixelMetrics = $hoverFrame.rendererPixelMetrics }) } else { [ordered]@{ pass = $false; reason = 'hover frame missing' } }
  normalToAway = if ($awayFrame) { CompareStableGeometry ([pscustomobject]@{ root = $directGeometry.root; canvas = $directGeometry.canvas; canvasPixels = $directGeometry.canvasPixels; pixelMetrics = $directPixelMetrics }) ([pscustomobject]@{ root = $awayFrame.geometry.root; canvas = $awayFrame.geometry.canvas; canvasPixels = $awayFrame.geometry.canvasPixels; pixelMetrics = $awayFrame.rendererPixelMetrics }) } else { [ordered]@{ pass = $false; reason = 'away frame missing' } }
}

$modelViewportCheck = $null
if ($ModelViewportEdit -and $modelViewportFrames.Count -eq 4) {
  $before = $modelViewportFrames[0]
  $moved = $modelViewportFrames[1]
  $zoomed = $modelViewportFrames[2]
  $exited = $modelViewportFrames[3]
  $beforeMatrix = [string]$before.state.runtime.'runtimeModelMatrix'
  $movedMatrix = [string]$moved.state.runtime.'runtimeModelMatrix'
  $zoomedMatrix = [string]$zoomed.state.runtime.'runtimeModelMatrix'
  $exitedMatrix = [string]$exited.state.runtime.'runtimeModelMatrix'
  $base = [pscustomobject]@{ root = $before.geometry.root; canvas = $before.geometry.canvas; canvasPixels = $before.geometry.canvasPixels; pixelMetrics = $before.rendererPixelMetrics }
  $move = [pscustomobject]@{ root = $moved.geometry.root; canvas = $moved.geometry.canvas; canvasPixels = $moved.geometry.canvasPixels; pixelMetrics = $moved.rendererPixelMetrics }
  $zoom = [pscustomobject]@{ root = $zoomed.geometry.root; canvas = $zoomed.geometry.canvas; canvasPixels = $zoomed.geometry.canvasPixels; pixelMetrics = $zoomed.rendererPixelMetrics }
  $exit = [pscustomobject]@{ root = $exited.geometry.root; canvas = $exited.geometry.canvas; canvasPixels = $exited.geometry.canvasPixels; pixelMetrics = $exited.rendererPixelMetrics }
  $modelViewportCheck = [ordered]@{
    canvasInvariant = (CompareStableGeometry $base $move).canvasPixelDimensionDeltaPx -eq 0 -and (CompareStableGeometry $base $zoom).canvasPixelDimensionDeltaPx -eq 0 -and (CompareStableGeometry $base $exit).canvasPixelDimensionDeltaPx -eq 0
    modelMatrixChangedOnMove = $beforeMatrix -ne $movedMatrix
    modelMatrixChangedOnZoom = $movedMatrix -ne $zoomedMatrix
    exitKeepsComposition = $zoomedMatrix -eq $exitedMatrix
    screenshots = @($modelViewportFrames | ForEach-Object { $_.rendererScreenshot })
  }
}

if ($SoakSeconds -gt 0) {
  Write-Output "soak-start=$SoakSeconds"
  Start-Sleep -Seconds $SoakSeconds
  $frames += Capture 'soak-finished' "${SoakSeconds}s soak"
  Write-Output 'soak-finished'
}

$lockedJson = if ($original.petLocked -eq $true) { 'true' } else { 'false' }
$trackingJson = if ($original.cursorTrackingEnabled -eq $true) { 'true' } else { 'false' }
$interactionJson = if ($original.petInteractionMode -eq $true) { 'true' } else { 'false' }
$watermarkJson = if ($original.live2dShowWatermark -eq $false) { 'false' } else { 'true' }
$viewportMapJson = if ($null -ne $original.modelViewportByModel) { $original.modelViewportByModel | ConvertTo-Json -Depth 10 -Compress } else { '{}' }
[void](Evaluate "window.baoyin.settings.save({settings:{petLocked:$lockedJson,cursorTrackingEnabled:$trackingJson,petInteractionMode:$interactionJson,live2dShowWatermark:$watermarkJson,modelViewportByModel:$viewportMapJson}}).then(()=>true)")
$result = [ordered]@{
  schemaVersion = 2
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  mode = 'real_desktop_cdp_plus_user32_cursor'
  target = $target.url
  selection = [ordered]@{ requiredUrl = '[?&]window=pet'; marker = 'body[data-window=pet] [data-pet-role=pet]'; canvasRequired = $true }
  rendererScreenshot = $rendererScreenshot
  threeStateCheck = $threeStateCheck
  modelViewportFrames = $modelViewportFrames
  modelViewportCheck = $modelViewportCheck
  nativePetWindowStyle = $nativeStyle
  frames = $frames
  clickProbe = $clickProbe
  restoredSettings = [ordered]@{ locked = $original.petLocked; tracking = $original.cursorTrackingEnabled; interactionMode = $original.petInteractionMode }
  limitations = @('Multi-monitor/DPI and virtual-desktop checks require the corresponding desktop topology.', 'Use -SoakSeconds 600 for the requested ten-minute soak.', 'The model silhouette uses a conservative approximation for input gating; Cubism ArtMesh hit testing remains the final tap target.')
}
$logPath = Join-Path $OutputDirectory 'cursor-interaction-check.json'
$result | ConvertTo-Json -Depth 16 | Set-Content -Path $logPath -Encoding utf8
$result | ConvertTo-Json -Depth 6
Write-Output "log=$logPath"
$script:socket.Dispose()

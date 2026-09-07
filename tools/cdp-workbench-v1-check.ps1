param(
  [int]$CdpPort = 9301,
  [string]$OutputDirectory = '',
  [switch]$SkipScreenshot,
  [switch]$CaptureOnly,
  [ValidateSet('current','light','dark')][string]$Theme = 'current'
)

$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'code\artifacts\workbench-v1-gui' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$script:messageId = 0
$script:socket = $null
$script:targetId = ''

function Open-SettingsPage {
  $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -TimeoutSec 3
  $page = $pages | Where-Object { $_.type -eq 'page' -and $_.url -match 'window=settings' } | Select-Object -First 1
  if (-not $page) { throw "No settings renderer page on CDP port $CdpPort" }
  $script:targetId = $page.id
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
      $timeout = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(25))
      try {
        $received = $script:socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $timeout.Token).GetAwaiter().GetResult()
      } finally {
        $timeout.Dispose()
      }
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
  if ($result.exceptionDetails) {
    $description = $result.exceptionDetails.exception.description
    throw "Runtime evaluation failed: $($result.exceptionDetails.text) $description"
  }
  return $result.result.value
}

function Set-WindowSize([int]$Width, [int]$Height) {
  Evaluate "window.resizeTo($Width, $Height); true" | Out-Null
  Start-Sleep -Milliseconds 500
}

try {
  Write-Host '[workbench-v1] connect'
  Open-SettingsPage
  Invoke-Cdp 'Page.enable' | Out-Null
  if ($CaptureOnly) {
    Set-WindowSize 1920 1200
    if ($Theme -ne 'current') {
      Evaluate "(() => { const wanted = '$Theme'; const current = document.documentElement.dataset.theme; if (current !== wanted) document.querySelector('[data-workbench=theme-toggle]')?.click(); return true; })()" | Out-Null
      Start-Sleep -Milliseconds 250
    }
    Evaluate 'window.starchat.app.showSettings(); true' | Out-Null
    Start-Sleep -Milliseconds 400
    $capture = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png'; fromSurface = $true; captureBeyondViewport = $false }
    $suffix = if ($Theme -eq 'current') { 'current' } else { $Theme }
    $capturePath = Join-Path $OutputDirectory "workbench-density-terminal-$suffix.png"
    [IO.File]::WriteAllBytes($capturePath, [Convert]::FromBase64String($capture.data))
    Write-Output $capturePath
    exit 0
  }
  Write-Host '[workbench-v1] small viewport'
  Set-WindowSize 1280 800
  $small = (Evaluate @'
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, timeout = 6000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await wait(120);
    }
    return null;
  };
  const clickCard = async (label) => {
    const card = [...document.querySelectorAll('.wb-tool-card')].find((item) => item.textContent.includes(label));
    if (!card) throw new Error(`Missing tool card: ${label}`);
    card.click();
    await wait(550);
  };
  const clickEntry = async (label) => {
    const entry = await waitFor(() => [...document.querySelectorAll('.wb-resource-tree button')].find((item) => item.querySelector('span')?.textContent.trim() === label), 4000);
    if (!entry) return false;
    entry.click();
    await wait(220);
    return true;
  };
  const toggle = async (selector, shouldExpand) => {
    const button = document.querySelector(selector);
    if (!button) throw new Error(`Missing toggle: ${selector}`);
    if ((button.getAttribute('aria-expanded') === 'true') !== shouldExpand) {
      button.click();
      await wait(180);
    }
  };
  await toggle('[data-workbench="right-rail-toggle"]', false);
  await toggle('[data-workbench="right-rail-toggle"]', true);
  await toggle('[data-workbench="bottom-panel-toggle"]', false);
  await toggle('[data-workbench="bottom-panel-toggle"]', true);
  document.querySelector('.wb-tool-panel-header [aria-label="关闭工具面板"]')?.click();
  await wait(120);
  await clickCard('资源管理器');
  await waitFor(() => document.querySelector('.wb-resource-tree button'), 4000);
  const rootEntries = [...document.querySelectorAll('.wb-resource-tree button')].map((item) => item.textContent.trim());
  const navigationReady = await clickEntry('code') && await clickEntry('src') && await clickEntry('shared') && await clickEntry('workbench.ts');
  const resourceReady = Boolean(await waitFor(() => document.querySelector('[data-workbench-tool="resources"] .wb-file-preview pre')?.textContent.includes('WorkbenchInspection'), 4000));
  await clickCard('源代码管理');
  const diffCandidate = 'code/src/shared/workbench.ts';
  const diffEntry = await waitFor(() => [...document.querySelectorAll('.wb-resource-tree button')].find((item) => item.querySelector('span')?.textContent.trim() === diffCandidate), 4000);
  diffEntry?.click();
  const diffText = diffEntry ? await waitFor(() => document.querySelector('.wb-diff-preview pre')?.textContent.trim(), 4000) : null;
  const sourceReady = Boolean(document.querySelector('[data-workbench-tool="source"]'));
  const diffReady = Boolean(diffText);
  const sourceCommitReady = Boolean(document.querySelector('[aria-label="Git 提交说明"]')) && document.querySelector('[aria-label="Git 提交说明"]')?.placeholder.includes('不会自动暂存');
  await clickCard('任务管理');
  const tasksReady = Boolean(document.querySelector('[data-workbench-tool="tasks"]'));
  await clickCard('终端');
  const terminalInput = document.querySelector('[aria-label="受控终端命令"]');
  const terminalReady = Boolean(document.querySelector('[data-workbench-tool="terminal"]')) && Boolean(terminalInput) && document.body.innerText.includes('只接受 Git 只读命令和项目验证脚本');
  if (terminalInput) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(terminalInput, 'git status --short');
    terminalInput.dispatchEvent(new Event('input', { bubbles: true }));
    terminalInput.form?.querySelector('button[type="submit"]')?.click();
  }
  const terminalCommandReady = Boolean(await waitFor(() => document.querySelector('[data-workbench-tool="terminal"] .wb-verification-output pre')?.textContent.trim(), 6000));
  const browser = [...document.querySelectorAll('.wb-tool-card')].find((item) => item.textContent.includes('浏览器'));
  await clickCard('浏览器');
  const browserEnabled = browser?.getAttribute('aria-disabled') !== 'true' && Boolean(document.querySelector('[data-workbench-tool="browser"] [aria-label="网页地址"]')) && document.body.innerText.includes('外部安全边界');
  await clickCard('终端');
  const shell = document.querySelector('.wb-shell').getBoundingClientRect();
  const main = document.querySelector('.wb-main-grid').getBoundingClientRect();
  const rail = document.querySelector('.wb-right-rail').getBoundingClientRect();
  const bottom = document.querySelector('.wb-bottom-panel').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.wb-tool-card')].map((item) => item.getBoundingClientRect());
  return JSON.stringify({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    diffCandidate,
    diffEntryFound: Boolean(diffEntry),
    rootEntries,
    navigationReady,
    resourceReady,
    sourceReady,
    diffReady,
    sourceCommitReady,
    tasksReady,
    terminalReady,
    terminalCommandReady,
    browserEnabled,
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    railInsideShell: rail.bottom <= shell.bottom + 1,
    cardsInsideRail: cards.every((rect) => rect.bottom <= rail.bottom + 1 && rect.right <= rail.right + 1),
    shellInsideViewport: shell.right <= window.innerWidth + 1,
    mainInsideViewport: main.right <= window.innerWidth + 1,
    railInsideViewport: rail.right <= window.innerWidth + 1,
    cardsInsideViewport: cards.every((rect) => rect.right <= window.innerWidth + 1),
    rightRailExpanded: document.querySelector('.wb-shell')?.dataset.rightRailState === 'expanded',
    bottomPanelOpen: document.querySelector('.wb-shell')?.dataset.bottomPanel === 'open',
    bottomDoesNotCoverRail: rail.bottom <= bottom.top + 1,
    geometry: { shell: { left: shell.left, right: shell.right, width: shell.width }, main: { left: main.left, right: main.right, width: main.width }, rail: { left: rail.left, right: rail.right, width: rail.width }, bottom: { top: bottom.top, bottom: bottom.bottom, height: bottom.height } },
    toolPanelVisible: document.querySelector('.wb-tool-panel')?.getBoundingClientRect().height > 200
  });
})()
'@ $true) | ConvertFrom-Json

  Write-Host '[workbench-v1] large viewport'
  Set-WindowSize 1920 1200
  $large = (Evaluate @'
JSON.stringify((() => {
  const shell = document.querySelector('.wb-shell').getBoundingClientRect();
  const main = document.querySelector('.wb-main-grid').getBoundingClientRect();
  const rail = document.querySelector('.wb-right-rail').getBoundingClientRect();
  const bottom = document.querySelector('.wb-bottom-panel').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.wb-tool-card')].map((item) => item.getBoundingClientRect());
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    railInsideShell: rail.bottom <= shell.bottom + 1,
    cardsInsideRail: cards.every((rect) => rect.bottom <= rail.bottom + 1 && rect.right <= rail.right + 1),
    shellInsideViewport: shell.right <= window.innerWidth + 1,
    mainInsideViewport: main.right <= window.innerWidth + 1,
    railInsideViewport: rail.right <= window.innerWidth + 1,
    cardsInsideViewport: cards.every((rect) => rect.right <= window.innerWidth + 1),
    rightRailExpanded: document.querySelector('.wb-shell')?.dataset.rightRailState === 'expanded',
    bottomPanelOpen: document.querySelector('.wb-shell')?.dataset.bottomPanel === 'open',
    bottomDoesNotCoverRail: rail.bottom <= bottom.top + 1,
    geometry: { shell: { left: shell.left, right: shell.right, width: shell.width }, main: { left: main.left, right: main.right, width: main.width }, rail: { left: rail.left, right: rail.right, width: rail.width }, bottom: { top: bottom.top, bottom: bottom.bottom, height: bottom.height } },
    terminalVisible: Boolean(document.querySelector('[data-workbench-tool="terminal"]'))
  };
})())
'@) | ConvertFrom-Json

  Evaluate 'window.starchat.app.showSettings(); true' | Out-Null
  Start-Sleep -Milliseconds 500

  $screenshotPath = $null
  if (-not $SkipScreenshot) {
    $capture = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png'; fromSurface = $true; captureBeyondViewport = $false }
    $screenshotPath = Join-Path $OutputDirectory 'workbench-v1-terminal-1920x1200.png'
    [IO.File]::WriteAllBytes($screenshotPath, [Convert]::FromBase64String($capture.data))
  }

  $accepted = $small.resourceReady -and $small.sourceReady -and $small.diffReady -and $small.sourceCommitReady -and $small.tasksReady -and $small.terminalReady -and $small.terminalCommandReady -and $small.browserEnabled -and $small.noHorizontalOverflow -and $small.railInsideShell -and $small.cardsInsideRail -and $small.shellInsideViewport -and $small.mainInsideViewport -and $small.railInsideViewport -and $small.cardsInsideViewport -and $small.rightRailExpanded -and $small.bottomPanelOpen -and $small.bottomDoesNotCoverRail -and $small.toolPanelVisible -and $large.noHorizontalOverflow -and $large.railInsideShell -and $large.cardsInsideRail -and $large.shellInsideViewport -and $large.mainInsideViewport -and $large.railInsideViewport -and $large.cardsInsideViewport -and $large.rightRailExpanded -and $large.bottomPanelOpen -and $large.bottomDoesNotCoverRail -and $large.terminalVisible
  $report = [ordered]@{ timestamp = (Get-Date).ToString('o'); cdpPort = $CdpPort; screenshot = $screenshotPath; small = $small; large = $large; accepted = $accepted }
  $reportPath = Join-Path $OutputDirectory 'workbench-v1-gui.json'
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  $report | ConvertTo-Json -Depth 12
  if (-not $accepted) { exit 1 }
} finally {
  if ($script:socket) { $script:socket.Dispose() }
}

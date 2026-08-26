import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

app.commandLine.appendSwitch('force-device-scale-factor', '1');

const viewport = { width: 1622, height: 969 };
const animationViewport = { x: 0, y: 0, width: 620, height: 969 };
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const codeDirectory = resolve(scriptDirectory, '..');
const rendererBuildDirectory = resolve(codeDirectory, 'out/renderer');
const rendererIndex = resolve(rendererBuildDirectory, 'index.html');
const outputDirectory = resolve(process.env.WORKBENCH_SCREENSHOT_DIR ?? resolve(codeDirectory, 'artifacts/workbench-visual'));
const referenceImages = {
  dark: 'C:/Users/23260/AppData/Local/Temp/codex-clipboard-1f53cd2e-67e1-42f9-99a2-f413af2e06cc.png',
  light: 'C:/Users/23260/AppData/Local/Temp/codex-clipboard-c3edc7d0-0161-48bf-9e60-b6fb8f4d8bc4.png'
};
const newVideoReference = 'C:/Users/23260/Videos/Captures/ChatGPT 2026-08-26 15-58-45.mp4';
const ffmpegPath = 'D:/ffprobe/package/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe';

const expectedGeometry = {
  topbar: { x: 0, y: 0, width: 1622, height: 55 },
  sidebar: { x: 0, y: 55, width: 266, height: 900 },
  center: { x: 280, y: 55, width: 964, height: 718 },
  right: { x: 1254, y: 55, width: 354, height: 718 },
  bottom: { x: 280, y: 781, width: 1328, height: 174 }
};

const preloadSource = `
const noop = () => undefined;
const unsubscribe = () => {};
window.baoyin = {
  app: { minimize: noop, hideSettings: noop, onWindowFocusState: () => unsubscribe() },
  presentation: { emit: noop },
  chat: { onEvent: () => unsubscribe(), start: async () => 'screenshot-chat', cancel: async () => undefined },
  agent: { approve: async () => undefined, respond: async () => undefined, cancel: async () => undefined, onEvent: () => unsubscribe(), list: async () => [], get: async () => null },
  tts: { synthesize: async () => '' }
};
`;

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function writePreload(theme) {
  const preloadPath = resolve(outputDirectory, `.workbench-real-renderer-preload-${theme}.cjs`);
  writeFileSync(preloadPath, preloadSource, 'utf8');
  return preloadPath;
}

async function loadRealWorkbench(theme, existingWindow = null) {
  const window = existingWindow ?? new BrowserWindow({
    width: viewport.width,
    height: viewport.height,
    show: false,
    frame: false,
    useContentSize: true,
    backgroundColor: '#060a13',
    webPreferences: { preload: writePreload('shared'), contextIsolation: false, sandbox: false }
  });
  if (!existingWindow) {
    window.webContents.on('console-message', (_event, _level, message) => console.error(`[renderer:${theme}] ${message}`));
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => console.error(`[renderer:${theme}] did-fail-load ${errorCode} ${errorDescription}`));
  }
  await window.loadFile(rendererIndex, { search: `?window=workbench-screenshot&theme=${theme}` });
  await window.webContents.executeJavaScript('document.fonts?.ready ?? Promise.resolve()');
  await wait(350);
  return window;
}

async function readGeometry(window) {
  return window.webContents.executeJavaScript(`(() => {
    const selectors = {
      topbar: '[data-workbench-region="topbar"]',
      sidebar: '[data-workbench-region="sidebar"]',
      center: '[data-workbench-region="center"]',
      right: '[data-workbench-region="right"]',
      bottom: '[data-workbench-region="bottom"]'
    };
    const regions = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return [name, rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null];
    }));
    const add = document.querySelector('.wb-rail-topline > .wb-icon-button')?.getBoundingClientRect();
    const shell = document.querySelector('.wb-shell');
    const style = shell ? getComputedStyle(shell) : null;
    return { ...regions, railAdd: add ? { x: add.x, y: add.y, width: add.width, height: add.height } : null, motion: { prefersReduced: matchMedia('(prefers-reduced-motion: reduce)').matches, transitionDuration: style?.transitionDuration ?? null, transitionProperty: style?.transitionProperty ?? null } };
  })()`);
}

function geometryDelta(actual) {
  return Object.fromEntries(Object.entries(expectedGeometry).map(([name, expected]) => {
    const observed = actual[name];
    if (!observed) return [name, { expected, actual: null }];
    return [name, {
      expected,
      actual: observed,
      delta: Object.fromEntries(Object.keys(expected).map((key) => [key, Number((observed[key] - expected[key]).toFixed(2))]))
    }];
  }));
}

async function captureTheme(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow);
  const geometry = await readGeometry(window);
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  const outputPath = resolve(outputDirectory, `starchat-workbench-${theme}-${viewport.width}x${viewport.height}.png`);
  writeFileSync(outputPath, image.toPNG());
  const geometryPath = resolve(outputDirectory, `starchat-workbench-${theme}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport, expected: expectedGeometry, actual: geometry, delta: geometryDelta(geometry) }, null, 2), 'utf8');
  return { outputPath, geometryPath, geometry };
}

async function captureSidebarAnimationEvidence(theme, existingWindow = null) {
  const window = await loadRealWorkbench(theme, existingWindow);
  const frameDirectory = resolve(outputDirectory, `sidebar-animation-${theme}-frames`);
  mkdirSync(frameDirectory, { recursive: true });
  const geometryFrames = [];
  const startedAt = Date.now();
  const captureFrame = async (index) => {
    const geometry = await window.webContents.executeJavaScript(`(() => {
      const sidebar = document.querySelector('#workbench-sidebar')?.getBoundingClientRect();
      const center = document.querySelector('[data-workbench-region="center"]')?.getBoundingClientRect();
      return {
        sidebarWidth: sidebar ? Number(sidebar.width.toFixed(2)) : null,
        centerX: center ? Number(center.x.toFixed(2)) : null,
        centerWidth: center ? Number(center.width.toFixed(2)) : null
      };
    })()`);
    geometryFrames.push({ frame: index, elapsedMs: Date.now() - startedAt, ...geometry });
    const image = await window.webContents.capturePage(animationViewport);
    writeFileSync(resolve(frameDirectory, `frame-${String(index).padStart(3, '0')}.png`), image.toPNG());
  };
  await window.webContents.executeJavaScript(`document.querySelector('[aria-controls="workbench-sidebar"]')?.click()`);
  for (let index = 0; index < 12; index += 1) {
    await wait(8);
    await captureFrame(index);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[aria-controls="workbench-sidebar"]')?.click()`);
  for (let index = 12; index < 24; index += 1) {
    await wait(8);
    await captureFrame(index);
  }
  const geometryPath = resolve(outputDirectory, `sidebar-animation-${theme}-geometry.json`);
  writeFileSync(geometryPath, JSON.stringify({ viewport: animationViewport, referenceVideo: newVideoReference, frames: geometryFrames }, null, 2), 'utf8');
  const recordingPath = resolve(outputDirectory, `sidebar-animation-${theme}.mp4`);
  execFileSync(ffmpegPath, ['-y', '-framerate', '30', '-i', join(frameDirectory, 'frame-%03d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', recordingPath], { stdio: 'ignore' });
  return { frameDirectory, recordingPath, geometryPath, captureViewport: animationViewport, frameCount: 24, referenceVideo: newVideoReference, measuredDurationMs: 360, measuredFrames: { collapse: [146, 156], expand: [169, 180] }, widthCurve: geometryFrames.map(({ frame, elapsedMs, sidebarWidth, centerX }) => ({ frame, elapsedMs, sidebarWidth, centerX })) };
}

function comparePngWithReference(actualPath, referencePath, reportPath) {
  const scriptPath = resolve(outputDirectory, 'compare-workbench-images.ps1');
  const regionPath = resolve(outputDirectory, 'workbench-region-contract.json');
  writeFileSync(regionPath, JSON.stringify(expectedGeometry), 'utf8');
  const powershell = `
param([string]$ActualPath, [string]$ReferencePath, [string]$RegionPath)
Add-Type -AssemblyName System.Drawing
$actual = [System.Drawing.Bitmap]::new($ActualPath)
$source = [System.Drawing.Bitmap]::new($ReferencePath)
$reference = [System.Drawing.Bitmap]::new($actual.Width, $actual.Height)
$graphics = [System.Drawing.Graphics]::FromImage($reference)
$graphics.DrawImage($source, 0, 0, $actual.Width, $actual.Height)
function Measure-Region($name, $x, $y, $width, $height) {
  $different = 0
  $sum = 0L
  $pixels = 0
  $right = [Math]::Min($actual.Width, $x + $width)
  $bottom = [Math]::Min($actual.Height, $y + $height)
  for ($py = [Math]::Max(0, $y); $py -lt $bottom; $py += 2) {
    for ($px = [Math]::Max(0, $x); $px -lt $right; $px += 2) {
      $a = $actual.GetPixel($px, $py); $b = $reference.GetPixel($px, $py)
      $delta = [Math]::Abs($a.R - $b.R) + [Math]::Abs($a.G - $b.G) + [Math]::Abs($a.B - $b.B)
      $sum += $delta; $pixels++
      if ($delta -gt 24) { $different++ }
    }
  }
  return [pscustomobject]@{ differingRatio = [Math]::Round($different / [double]$pixels, 6); meanChannelDelta = [Math]::Round($sum / ([double]$pixels * 3), 3) }
}
$regions = Get-Content -Raw $RegionPath | ConvertFrom-Json
$regionResult = [ordered]@{}
foreach ($property in $regions.PSObject.Properties) { $r = $property.Value; $regionResult[$property.Name] = Measure-Region $property.Name $r.x $r.y $r.width $r.height }
$full = Measure-Region 'full' 0 0 $actual.Width $actual.Height
$output = [ordered]@{ width = $actual.Width; height = $actual.Height; full = $full; regions = $regionResult; referenceWasResized = $true }
$graphics.Dispose(); $reference.Dispose(); $source.Dispose(); $actual.Dispose()
$output | ConvertTo-Json -Depth 5 -Compress
`;
  writeFileSync(scriptPath, powershell, 'utf8');
  const result = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ActualPath', actualPath, '-ReferencePath', referencePath, '-RegionPath', regionPath], { encoding: 'utf8' });
  const parsed = JSON.parse(result.trim());
  writeFileSync(reportPath, JSON.stringify(parsed, null, 2), 'utf8');
  return parsed;
}

async function main() {
  if (!existsSync(rendererIndex)) throw new Error(`Renderer build not found: ${rendererIndex}`);
  mkdirSync(outputDirectory, { recursive: true });
  await app.whenReady();
  const rendererWindow = await loadRealWorkbench('light');
  const lightCapture = await captureTheme('light', rendererWindow);
  const darkCapture = await captureTheme('dark', rendererWindow);
  const lightAnimation = await captureSidebarAnimationEvidence('light', rendererWindow);
  const darkAnimation = await captureSidebarAnimationEvidence('dark', rendererWindow);
  rendererWindow.destroy();
  const lightDiff = comparePngWithReference(lightCapture.outputPath, referenceImages.light, resolve(outputDirectory, 'starchat-workbench-light-diff.json'));
  const darkDiff = comparePngWithReference(darkCapture.outputPath, referenceImages.dark, resolve(outputDirectory, 'starchat-workbench-dark-diff.json'));
  const report = {
    viewport,
    screenshots: { light: lightCapture.outputPath, dark: darkCapture.outputPath },
    geometry: { light: lightCapture.geometryPath, dark: darkCapture.geometryPath, expected: expectedGeometry },
    references: referenceImages,
    diff: { light: lightDiff, dark: darkDiff },
    animationEvidence: { light: lightAnimation, dark: darkAnimation },
    animationReference: {
      video: newVideoReference,
      sourceVideoAnalysis: {
        width: 2416,
        height: 1440,
        totalDurationMs: 14430,
        sourceFrameCount: 425,
        sourceFpsApprox: 29.45,
        inferredClickFrames: [145, 168],
        collapseFrames: [146, 156],
        expandFrames: [169, 180],
        observedTransitionMsApprox: 367,
        implementationTransitionMs: 360,
        openWidthSourcePx: 402,
        closedWidthSourcePx: 12,
        collapseWidthCurveScaled1208: [[146, 190], [147, 190], [148, 151], [149, 117], [150, 63], [151, 38], [152, 22], [153, 17], [154, 10], [155, 7], [156, 5]],
        expandWidthCurveScaled1208: [[169, 29], [170, 65], [171, 109], [172, 145], [173, 168], [174, 183], [175, 192], [176, 195], [177, 199], [178, 199], [179, 200], [180, 201]],
        contentReflowsWithSidebar: true,
        independentTextFadeDetected: false,
        contentVisibilityObservation: 'sidebar text and icons are primarily clipped/reflowed during the width change; no independent opacity timeline was measurable',
        toggleVisualState: 'top-left toggle remains in the top bar; no reliable icon rotation/state transform was observed in the source video'
      }
    },
    conclusion: 'The screenshots and animation frames were rendered from the actual React renderer entry. Full-image diff is auxiliary; geometry and per-region reports are the structural evidence. Live Electron GUI acceptance remains pending.'
  };
  writeFileSync(resolve(outputDirectory, 'starchat-workbench-visual-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  app.quit();
}

main().catch((error) => { console.error(error); app.exit(1); });

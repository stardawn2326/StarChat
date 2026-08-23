[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$patchRoot = Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter 'codex-windows-fast-patch-skill-*' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $patchRoot) {
  throw 'codex-windows-fast-patch-skill repository was not found under TEMP.'
}

$sourceScript = Join-Path $patchRoot.FullName 'scripts\patch_codex_fast_mode_windows_msix.ps1'
if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) {
  throw "Original MSIX patch script not found: $sourceScript"
}

$codexPackage = Get-AppxPackage -Name OpenAI.Codex |
  Sort-Object Version -Descending |
  Select-Object -First 1
if (-not $codexPackage) {
  throw 'OpenAI.Codex package was not found.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$repairOutput = Join-Path $env:TEMP ('codex-msix-computer-use-focused-' + $stamp)
New-Item -ItemType Directory -Force -Path $repairOutput | Out-Null

$publisher = (Get-AppxPackageManifest -Package $codexPackage).Package.Identity.Publisher
$signingCertificate = Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Subject -eq $publisher -and
    $_.HasPrivateKey -and
    $_.NotAfter -gt (Get-Date)
  } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1
if (-not $signingCertificate) {
  throw "No reusable current-user signing certificate found for $publisher."
}
$certificateFile = Join-Path $repairOutput 'codex-signing.cer'
Export-Certificate -Cert $signingCertificate -FilePath $certificateFile -Force | Out-Null
foreach ($storePath in @('Cert:\CurrentUser\Root', 'Cert:\CurrentUser\TrustedPeople')) {
  Import-Certificate -FilePath $certificateFile -CertStoreLocation $storePath | Out-Null
}

$generatedScript = Join-Path $repairOutput 'patch_codex_computer_use_generated.ps1'
$source = Get-Content -Raw -LiteralPath $sourceScript
$eol = [Environment]::NewLine

$parameterAnchor = '  [switch]$OnlyModelExperience,'
if (-not $source.Contains($parameterAnchor)) {
  throw 'Could not find the original patch script parameter anchor.'
}
$source = $source.Replace(
  $parameterAnchor,
  $parameterAnchor + $eol + '  [switch]$OnlyComputerUseNodeRepl,'
)

$focusedBranch = @'
  if ($OnlyComputerUseNodeRepl) {
    $viteBuildDir = Join-Path $extractDir '.vite\build'
    if (-not (Test-Path -LiteralPath $viteBuildDir -PathType Container)) {
      Fail "vite build directory not found in extracted asar: $viteBuildDir"
    }

    $nodeReplTarget = $null
    foreach ($candidate in (Get-ChildItem -LiteralPath $viteBuildDir -Filter '*.js' -File -ErrorAction SilentlyContinue)) {
      $text = Get-Content -Raw -LiteralPath $candidate.FullName
      if ($text.Contains('NODE_REPL_TRUSTED_CODE_PATHS') -and
          $text.Contains('NODE_REPL_NODE_MODULE_DIRS') -and
          ($text.Contains('CODEX_NODE_REPL_TRUSTED_PATHS_V1') -or
           $text -match '\[[A-Za-z_$][\w$]*\]:[A-Za-z_$][\w$]*\(\[[A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\],[A-Za-z_$][\w$]*\)')) {
        $nodeReplTarget = $candidate.FullName
        break
      }
    }
    if ([string]::IsNullOrWhiteSpace($nodeReplTarget)) {
      Fail 'could not find Node REPL trusted-code-path generator in extracted main bundle'
    }

    Write-Log "focused Node REPL trusted-paths target: $nodeReplTarget"
    $nodeReplResult = Invoke-NodePatcher $nodePath $patchers.NodeReplTrustedPaths @($nodeReplTarget)
    Write-Log "focused Node REPL trusted-paths patch result: $nodeReplResult"
    & $nodePath --check $nodeReplTarget
    if ($LASTEXITCODE -ne 0) {
      Fail "focused Node REPL target failed node --check: $nodeReplTarget"
    }

    if ($DryRun) {
      Write-Log 'dry run: focused Node REPL patch target validation completed; no package was changed'
      return $false
    }
    if ($nodeReplResult -eq 'already-patched') {
      Write-Log 'focused Node REPL ASAR patch already present'
      return $false
    }

    Write-Log 'repacking app.asar for focused Computer Use repair'
    Invoke-NpxAsar 'pack' $extractDir $newAsarPath
    Copy-Item -LiteralPath $newAsarPath -Destination $asarPath -Force
    return $true
  }

'@

$dispatchAnchor = '  $targets = Find-PatchTargets $rgPath $extractDir'
if (-not $source.Contains($dispatchAnchor)) {
  throw 'Could not find the original ASAR patch dispatch anchor.'
}
$source = $source.Replace($dispatchAnchor, $focusedBranch + $eol + $dispatchAnchor)
$trustCall = '    Trust-SigningCertificate $cert'
if (-not $source.Contains($trustCall)) {
  throw 'Could not find the original machine-trust call.'
}
$source = $source.Replace($trustCall, "    Write-Log 'current-user certificate trust prepared by focused repair'")
[System.IO.File]::WriteAllText($generatedScript, $source, [System.Text.UTF8Encoding]::new($false))

$appPath = Join-Path $codexPackage.InstallLocation 'app'
Write-Output "FocusedRepairOutput=$repairOutput"
Write-Output "SourcePackage=$($codexPackage.PackageFullName)"
Write-Output "AppPath=$appPath"

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $generatedScript `
  -AppPath $appPath `
  -OutputRoot $repairOutput `
  -InstallPrerequisites `
  -Install `
  -ForceRebuild `
  -OnlyComputerUseNodeRepl `
  -NoLaunch `
  -KeepWorkDir
if ($LASTEXITCODE -ne 0) {
  throw "Focused Computer Use MSIX repair failed (exit code $LASTEXITCODE). Output: $repairOutput"
}

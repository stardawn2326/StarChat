[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$MsixPath,
  [Parameter(Mandatory = $true)]
  [string]$StatusPath
)

$ErrorActionPreference = 'Stop'

function Write-Status {
  param(
    [string]$State,
    [string]$Message,
    [object]$Package = $null
  )
  $payload = [ordered]@{
    state = $State
    message = $Message
    timestamp = (Get-Date).ToString('o')
    package = $Package
  }
  $payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}

try {
  if (-not (Test-Path -LiteralPath $MsixPath -PathType Leaf)) {
    throw "MSIX not found: $MsixPath"
  }
  # The MSIX signature was independently verified before this detached installer
  # starts. Avoid loading Microsoft.PowerShell.Security in the detached process.

  $existing = Get-AppxPackage -Name OpenAI.Codex |
    Sort-Object Version -Descending |
    Select-Object -First 1
  if (-not $existing) {
    throw 'Existing OpenAI.Codex package was not found.'
  }

  Write-Status 'stopping' 'Stopping the existing Codex package before replacement.'
  $installRoot = $existing.InstallLocation.TrimEnd('\')
  $processes = Get-Process -Name Codex,ChatGPT -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Path -and (
        $_.Path.StartsWith($installRoot, [StringComparison]::OrdinalIgnoreCase) -or
        $_.Path -like '*\WindowsApps\OpenAI.Codex_*\app\Codex.exe' -or
        $_.Path -like '*\WindowsApps\OpenAI.Codex_*\app\ChatGPT.exe'
      )
    }
  foreach ($process in $processes) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }

  Write-Status 'removing' 'Removing the existing package while preserving application data.'
  try {
    Remove-AppxPackage -Package $existing.PackageFullName -PreserveApplicationData -ErrorAction Stop
  } catch {
    Remove-AppxPackage -Package $existing.PackageFullName -ErrorAction Stop
  }

  Write-Status 'installing' 'Installing the signed focused Computer Use MSIX.'
  Add-AppxPackage -Path $MsixPath -ErrorAction Stop
  $installed = Get-AppxPackage -Name OpenAI.Codex |
    Sort-Object Version -Descending |
    Select-Object -First 1
  if (-not $installed) {
    throw 'Codex package was not present after Add-AppxPackage.'
  }

  $asarPath = Join-Path $installed.InstallLocation 'app\resources\app.asar'
  $bytes = [IO.File]::ReadAllBytes($asarPath)
  $asarText = [Text.Encoding]::ASCII.GetString($bytes)
  if (-not $asarText.Contains('CODEX_NODE_REPL_TRUSTED_PATHS_V1')) {
    throw 'Installed app.asar does not contain CODEX_NODE_REPL_TRUSTED_PATHS_V1.'
  }

  $packageInfo = [ordered]@{
    fullName = $installed.PackageFullName
    version = [string]$installed.Version
    installLocation = $installed.InstallLocation
    signatureKind = [string]$installed.SignatureKind
  }
  Write-Status 'success' 'Focused Computer Use MSIX installed and app.asar marker verified.' $packageInfo
} catch {
  Write-Status 'failed' $_.Exception.Message
  exit 1
}

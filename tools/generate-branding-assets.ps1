$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconRoot = Join-Path $projectRoot 'assets/icons'
$buildRoot = Join-Path $projectRoot 'code/build'
$sourcePath = Join-Path $iconRoot 'baoyin-source.png'
$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)

New-Item -ItemType Directory -Force -Path $iconRoot, $buildRoot | Out-Null
if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Icon source is missing: $sourcePath"
}

function Save-ResizedPng([System.Drawing.Image]$source, [int]$size, [string]$destination) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $size, $size), 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
  foreach ($size in $sizes) {
    Save-ResizedPng $source $size (Join-Path $iconRoot "baoyin-$size.png")
    Save-ResizedPng $source $size (Join-Path $iconRoot "tray-$size.png")
  }
} finally {
  $source.Dispose()
}

Copy-Item -LiteralPath (Join-Path $iconRoot 'baoyin-256.png') -Destination (Join-Path $buildRoot 'icon.png') -Force
Copy-Item -LiteralPath (Join-Path $iconRoot 'tray-32.png') -Destination (Join-Path $buildRoot 'tray-32.png') -Force

$pngFrames = @($sizes | ForEach-Object {
  [pscustomobject]@{ Size = $_; Data = [System.IO.File]::ReadAllBytes((Join-Path $iconRoot "baoyin-$_.png")) }
})
$icoPath = Join-Path $buildRoot 'icon.ico'
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$pngFrames.Count)
  $dataOffset = 6 + (16 * $pngFrames.Count)
  foreach ($frame in $pngFrames) {
    $widthByte = if ($frame.Size -eq 256) { [byte]0 } else { [byte]$frame.Size }
    $writer.Write($widthByte)
    $writer.Write($widthByte)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frame.Data.Length)
    $writer.Write([uint32]$dataOffset)
    $dataOffset += $frame.Data.Length
  }
  foreach ($frame in $pngFrames) {
    $writer.Write($frame.Data)
  }
} finally {
  $writer.Dispose()
  $stream.Dispose()
}

Write-Output "Generated $($pngFrames.Count) PNG frames, tray resources and $icoPath from $sourcePath"

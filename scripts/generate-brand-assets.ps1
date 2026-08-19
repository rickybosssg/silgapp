param(
  [Parameter(Mandatory = $true)]
  [string]$SourceLogo
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourceLogo))

function Save-ResizedImage {
  param(
    [string]$Path,
    [int]$Width,
    [int]$Height,
    [double]$Scale = 1,
    [System.Drawing.Color]$Background = [System.Drawing.Color]::Transparent
  )

  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  if (Test-Path -LiteralPath $Path) {
    return
  }

  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear($Background)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $targetWidth = [int]($Width * $Scale)
  $targetHeight = [int]($Height * $Scale)
  $x = [int](($Width - $targetWidth) / 2)
  $y = [int](($Height - $targetHeight) / 2)
  $graphics.DrawImage($source, $x, $y, $targetWidth, $targetHeight)

  $temporaryPath = Join-Path ([System.IO.Path]::GetTempPath()) "silgapp-$([System.Guid]::NewGuid().ToString('N')).png"
  $bitmap.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()

  Copy-Item -LiteralPath $temporaryPath -Destination $Path -Force
  [System.IO.File]::Delete($temporaryPath)
}

try {
  $publicDir = Join-Path $root "public"
  if (-not (Test-Path -LiteralPath $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir | Out-Null
  }
  $webLogo = Join-Path $publicDir "silgapp-logo-official.jpg"
  $copyWebLogo = -not (Test-Path -LiteralPath $webLogo)
  if (-not $copyWebLogo) {
    $copyWebLogo = (Get-FileHash -Algorithm SHA256 -LiteralPath $SourceLogo).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $webLogo).Hash
  }
  if ($copyWebLogo) {
    Copy-Item -LiteralPath $SourceLogo -Destination $webLogo -Force
  }
  Save-ResizedImage -Path (Join-Path $publicDir "silgapp-icon-192.png") -Width 192 -Height 192
  Save-ResizedImage -Path (Join-Path $publicDir "silgapp-icon-512.png") -Width 512 -Height 512
  Save-ResizedImage -Path (Join-Path $publicDir "apple-touch-icon.png") -Width 180 -Height 180

  $legacySizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
  }
  $foregroundSizes = @{
    "mipmap-mdpi" = 108
    "mipmap-hdpi" = 162
    "mipmap-xhdpi" = 216
    "mipmap-xxhdpi" = 324
    "mipmap-xxxhdpi" = 432
  }

  foreach ($density in $legacySizes.Keys) {
    $dir = Join-Path $root "android/app/src/main/res/$density"
    $size = $legacySizes[$density]
    Save-ResizedImage -Path (Join-Path $dir "silgapp_launcher.png") -Width $size -Height $size
    Save-ResizedImage -Path (Join-Path $dir "silgapp_launcher_round.png") -Width $size -Height $size
    $foregroundSize = $foregroundSizes[$density]
    Save-ResizedImage -Path (Join-Path $dir "silgapp_launcher_foreground.png") -Width $foregroundSize -Height $foregroundSize -Scale 0.72
  }

  Get-ChildItem -LiteralPath (Join-Path $root "android/app/src/main/res") -Filter "splash.png" -Recurse | ForEach-Object {
    $current = [System.Drawing.Image]::FromFile($_.FullName)
    $width = $current.Width
    $height = $current.Height
    $current.Dispose()
    Save-ResizedImage -Path (Join-Path $_.DirectoryName "silgapp_splash.png") -Width $width -Height $height -Scale 0.52 -Background ([System.Drawing.Color]::FromArgb(255, 243, 247, 255))
  }

  Save-ResizedImage -Path (Join-Path $root "ios/App/App/Assets.xcassets/AppIcon.appiconset/Silgapp-AppIcon-1024.png") -Width 1024 -Height 1024
  Get-ChildItem -LiteralPath (Join-Path $root "ios/App/App/Assets.xcassets/Splash.imageset") -Filter "*.png" | ForEach-Object {
    if ($_.Name -like "Silgapp-Splash-*") {
      return
    }
    $current = [System.Drawing.Image]::FromFile($_.FullName)
    $width = $current.Width
    $height = $current.Height
    $current.Dispose()
    $scaleSuffix = if ($_.Name -like "*-2.png") { "1x" } elseif ($_.Name -like "*-1.png") { "2x" } else { "3x" }
    Save-ResizedImage -Path (Join-Path $_.DirectoryName "Silgapp-Splash-$scaleSuffix.png") -Width $width -Height $height -Scale 0.45 -Background ([System.Drawing.Color]::FromArgb(255, 243, 247, 255))
  }
}
finally {
  $source.Dispose()
}

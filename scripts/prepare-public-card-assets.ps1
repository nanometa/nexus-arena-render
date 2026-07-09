param(
  [string]$SourceRoot = "assets/cards/generated-filtered",
  [string]$TargetRoot = "public/assets/cards/generated-filtered",
  [int]$MaxWidth = 360
)

Add-Type -AssemblyName System.Drawing

$sourceFull = Resolve-Path -LiteralPath $SourceRoot
$targetFull = Join-Path (Get-Location) $TargetRoot

New-Item -ItemType Directory -Force -Path $targetFull | Out-Null

$pngCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/png' } |
  Select-Object -First 1

$files = Get-ChildItem -LiteralPath $sourceFull -Recurse -File -Filter *.png
$count = 0

foreach ($file in $files) {
  $relative = $file.FullName.Substring($sourceFull.Path.Length).TrimStart('\', '/')
  $target = Join-Path $targetFull $relative
  $targetDir = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

  $image = [System.Drawing.Image]::FromFile($file.FullName)
  try {
    if ($image.Width -le $MaxWidth) {
      Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    } else {
      $ratio = $MaxWidth / $image.Width
      $height = [Math]::Max(1, [int][Math]::Round($image.Height * $ratio))
      $bitmap = New-Object System.Drawing.Bitmap $MaxWidth, $height
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.DrawImage($image, 0, 0, $MaxWidth, $height)
        } finally {
          $graphics.Dispose()
        }
        $bitmap.Save($target, $pngCodec, $null)
      } finally {
        $bitmap.Dispose()
      }
    }
  } finally {
    $image.Dispose()
  }

  $count += 1
}

$size = Get-ChildItem -LiteralPath $targetFull -Recurse -File |
  Measure-Object -Property Length -Sum

Write-Output "Prepared $count card assets in $TargetRoot"
Write-Output ("Size MB: " + [Math]::Round($size.Sum / 1MB, 2))

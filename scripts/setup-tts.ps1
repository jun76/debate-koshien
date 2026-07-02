param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$ttsDir = Join-Path $Root "assets\tts"
$piperDir = Join-Path $ttsDir "piper"
$modelDir = Join-Path $ttsDir "models"
$tmpDir = Join-Path $ttsDir "_tmp"

New-Item -ItemType Directory -Force -Path $piperDir, $modelDir, $tmpDir | Out-Null

$zip = Join-Path $tmpDir "piper-windows-x64.zip"
$piperExe = Join-Path $piperDir "piper.exe"

if (-not (Test-Path -LiteralPath $piperExe)) {
  $url = "https://github.com/ayutaz/piper-plus/releases/latest/download/piper-windows-x64.zip"
  Write-Host "Downloading piper-plus..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $url -OutFile $zip

  $extractDir = Join-Path $tmpDir "piper"
  if (Test-Path -LiteralPath $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
  }
  Expand-Archive -LiteralPath $zip -DestinationPath $extractDir -Force

  $found = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "piper.exe" | Select-Object -First 1
  if (-not $found) {
    throw "piper.exe was not found in the downloaded archive."
  }

  Copy-Item -Path (Join-Path $found.Directory.FullName "*") -Destination $piperDir -Recurse -Force
}

$extractDir = Join-Path $tmpDir "piper"
$shareSource = Get-ChildItem -LiteralPath $extractDir -Recurse -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\share$" } |
  Select-Object -First 1
if ($shareSource) {
  $shareDest = Join-Path $piperDir "share"
  New-Item -ItemType Directory -Force -Path $shareDest | Out-Null
  Copy-Item -Path (Join-Path $shareSource.FullName "*") -Destination $shareDest -Recurse -Force
}

$modelPath = Join-Path $modelDir "tsukuyomi.onnx"
$configPath = Join-Path $modelDir "config.json"

if (-not (Test-Path -LiteralPath $modelPath)) {
  Write-Host "Downloading Tsukuyomi model..." -ForegroundColor Cyan
  Invoke-WebRequest `
    -Uri "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/tsukuyomi-chan-6lang-fp16.onnx" `
    -OutFile $modelPath
}

if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Host "Downloading Tsukuyomi config..." -ForegroundColor Cyan
  Invoke-WebRequest `
    -Uri "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/config.json" `
    -OutFile $configPath
}

$sample = Join-Path $ttsDir "sample.wav"
Write-Host "Testing synthesis..." -ForegroundColor Cyan
if (Test-Path -LiteralPath $sample) {
  Remove-Item -LiteralPath $sample -Force
}
$testText = -join ([char[]](0x97F3, 0x58F0, 0x5408, 0x6210, 0x306E, 0x30C6, 0x30B9, 0x30C8, 0x3067, 0x3059, 0x3002))
$env:OPENJTALK_DICTIONARY_PATH = Join-Path $piperDir "share\open_jtalk\dic"
& $piperExe --model $modelPath --config $configPath --text $testText --output_file $sample
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sample)) {
  throw "piper-plus synthesis test failed."
}

Write-Host "TTS is ready: $ttsDir" -ForegroundColor Green

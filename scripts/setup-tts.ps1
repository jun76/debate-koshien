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

# Voice models live under models/<lang>/. The server picks a model by the match's language.
$jaDir = Join-Path $modelDir "ja"
$enDir = Join-Path $modelDir "en"
New-Item -ItemType Directory -Force -Path $jaDir, $enDir | Out-Null

# Japanese: Tsukuyomi-chan (multilingual model).
$jaModel = Join-Path $jaDir "tsukuyomi.onnx"
$jaConfig = Join-Path $jaDir "config.json"
if (-not (Test-Path -LiteralPath $jaModel)) {
  Write-Host "Downloading Japanese (Tsukuyomi) model..." -ForegroundColor Cyan
  Invoke-WebRequest `
    -Uri "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/tsukuyomi-chan-6lang-fp16.onnx" `
    -OutFile $jaModel
}
if (-not (Test-Path -LiteralPath $jaConfig)) {
  Write-Host "Downloading Japanese (Tsukuyomi) config..." -ForegroundColor Cyan
  Invoke-WebRequest `
    -Uri "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/config.json" `
    -OutFile $jaConfig
}

# English: a standard piper en_US voice (config filename matches "<model>.onnx.json").
$enModel = Join-Path $enDir "en_US-lessac-medium.onnx"
$enConfig = Join-Path $enDir "en_US-lessac-medium.onnx.json"
$enBase = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"
if (-not (Test-Path -LiteralPath $enModel)) {
  Write-Host "Downloading English (en_US-lessac-medium) model..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri "$enBase/en_US-lessac-medium.onnx" -OutFile $enModel
}
if (-not (Test-Path -LiteralPath $enConfig)) {
  Write-Host "Downloading English (en_US-lessac-medium) config..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri "$enBase/en_US-lessac-medium.onnx.json" -OutFile $enConfig
}

$env:OPENJTALK_DICTIONARY_PATH = Join-Path $piperDir "share\open_jtalk\dic"

function Test-Synthesis($label, $model, $config, $text, $out) {
  Write-Host "Testing $label synthesis..." -ForegroundColor Cyan
  if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
  & $piperExe --model $model --config $config --text $text --output_file $out
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $out)) {
    throw "piper-plus $label synthesis test failed."
  }
}

$jaText = -join ([char[]](0x97F3, 0x58F0, 0x5408, 0x6210, 0x306E, 0x30C6, 0x30B9, 0x30C8, 0x3067, 0x3059, 0x3002))
Test-Synthesis "Japanese" $jaModel $jaConfig $jaText (Join-Path $ttsDir "sample-ja.wav")
Test-Synthesis "English" $enModel $enConfig "This is a synthesis test." (Join-Path $ttsDir "sample-en.wav")

Write-Host "TTS is ready (ja + en): $ttsDir" -ForegroundColor Green

param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "runtime.ps1")

$ttsDir = Join-Path $Root $RunSettings.Tts.Root
$piperDir = Join-Path $ttsDir $RunSettings.Tts.PiperDir
$modelDir = Join-Path $ttsDir $RunSettings.Tts.ModelsDir
$tmpDir = Join-Path $ttsDir $RunSettings.Tts.TempDir

New-Item -ItemType Directory -Force -Path $piperDir, $modelDir, $tmpDir | Out-Null

$zip = Join-Path $tmpDir $RunSettings.Tts.Windows.ArchiveName
$piperExe = Join-Path $piperDir $RunSettings.Tts.Windows.BinaryName

if (-not (Test-Path -LiteralPath $piperExe)) {
  Write-Host "Downloading piper-plus..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $RunSettings.Tts.Windows.ArchiveUrl -OutFile $zip

  $extractDir = Join-Path $tmpDir "piper"
  if (Test-Path -LiteralPath $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
  }
  Expand-Archive -LiteralPath $zip -DestinationPath $extractDir -Force

  $found = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter $RunSettings.Tts.Windows.BinaryName | Select-Object -First 1
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
$jaDir = Join-Path $modelDir $RunSettings.Tts.Japanese.Language
$enDir = Join-Path $modelDir $RunSettings.Tts.English.Language
New-Item -ItemType Directory -Force -Path $jaDir, $enDir | Out-Null

# Japanese: Tsukuyomi-chan (multilingual model).
$jaModel = Join-Path $jaDir $RunSettings.Tts.Japanese.ModelFile
$jaConfig = Join-Path $jaDir $RunSettings.Tts.Japanese.ConfigFile
if (-not (Test-Path -LiteralPath $jaModel)) {
  Write-Host "Downloading Japanese (Tsukuyomi) model..." -ForegroundColor Cyan
  Invoke-WebRequest `
    -Uri $RunSettings.Tts.Japanese.ModelUrl `
    -OutFile $jaModel
}
if (-not (Test-Path -LiteralPath $jaConfig)) {
  Write-Host "Downloading Japanese (Tsukuyomi) config..." -ForegroundColor Cyan
  Invoke-WebRequest `
    -Uri $RunSettings.Tts.Japanese.ConfigUrl `
    -OutFile $jaConfig
}

# English: a standard piper en_US voice (config filename matches "<model>.onnx.json").
$enModel = Join-Path $enDir $RunSettings.Tts.English.ModelFile
$enConfig = Join-Path $enDir $RunSettings.Tts.English.ConfigFile
$enBase = $RunSettings.Tts.English.BaseUrl
if (-not (Test-Path -LiteralPath $enModel)) {
  Write-Host "Downloading English (en_US-lessac-medium) model..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri "$enBase/$($RunSettings.Tts.English.ModelFile)" -OutFile $enModel
}
if (-not (Test-Path -LiteralPath $enConfig)) {
  Write-Host "Downloading English (en_US-lessac-medium) config..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri "$enBase/$($RunSettings.Tts.English.ConfigFile)" -OutFile $enConfig
}

$env:OPENJTALK_DICTIONARY_PATH = Join-Path $piperDir "share\open_jtalk\dic"
# English G2P needs the CMU dictionary; with piper.exe and share\ side by side the exe-relative
# lookup misses it, so point piper-plus at the dicts folder explicitly (the server does the same).
$env:PIPER_DICTIONARIES_PATH = Join-Path $piperDir "share\piper\dicts"

function Test-Synthesis($label, $model, $config, $text, $out) {
  Write-Host "Testing $label synthesis..." -ForegroundColor Cyan
  if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
  & $piperExe --model $model --config $config --text $text --output_file $out
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $out)) {
    throw "piper-plus $label synthesis test failed."
  }
}

$jaText = $RunSettings.Tts.Japanese.SampleText
Test-Synthesis $RunSettings.Tts.Japanese.Label $jaModel $jaConfig $jaText (Join-Path $ttsDir $RunSettings.Tts.Japanese.SampleFile)
Test-Synthesis $RunSettings.Tts.English.Label $enModel $enConfig $RunSettings.Tts.English.SampleText (Join-Path $ttsDir $RunSettings.Tts.English.SampleFile)

Write-Host "TTS is ready (ja + en): $ttsDir" -ForegroundColor Green

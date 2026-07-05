#Requires -Version 5.1
<#
.SYNOPSIS
    Stop the AI Debate Koshien app started by scripts/start.ps1.
.DESCRIPTION
    Kills recorded process trees, matching WSL workspace processes, and workspace listeners.
#>

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".run"
$repoName = Split-Path $root -Leaf
. (Join-Path $PSScriptRoot "runtime.ps1")

$serverMatchToken = $RunSettings.Server.MatchToken
$webMatchToken = $RunSettings.Web.MatchToken
$serverPort = [int]$RunSettings.Server.Port
$defaultWebPort = [int]$RunSettings.Web.Port

function Get-ComponentProcess($name, $matchToken) {
    $pidFile = Join-Path $runDir "$name.pid"
    if (-not (Test-Path $pidFile)) {
        return $null
    }

    $procId = (Get-Content -Raw $pidFile -ErrorAction SilentlyContinue).Trim()
    if ($procId -notmatch "^\d+$") {
        return $null
    }

    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -like "*pnpm*$matchToken*") {
        return $proc
    }
    return $null
}

function Remove-ComponentFiles($name) {
    foreach ($suffix in "pid", "url", "port", "log", "stdout.log", "stderr.log") {
        Remove-Item (Join-Path $runDir "$name.$suffix") -Force -ErrorAction SilentlyContinue
    }
}

function Stop-Component($name, $matchToken) {
    $proc = Get-ComponentProcess $name $matchToken
    if ($proc) {
        taskkill /PID $proc.ProcessId /T /F 2>$null | Out-Null
        Write-Host "Stopped $name (PID $($proc.ProcessId))"
    }
    Remove-ComponentFiles $name
}

function Get-WslCommand() {
    return Get-Command "wsl.exe" -ErrorAction SilentlyContinue
}

function Get-WslPatterns($componentName) {
    switch ($componentName) {
        "server" {
            return @(
                "@$repoName/server dev",
                "@$repoName/server start",
                "$repoName/server/node_modules/.bin/.*/tsx/dist/cli.mjs watch --clear-screen=false src/index.ts",
                "$repoName/server/node_modules/.bin/.*/tsx/dist/cli.mjs src/index.ts"
            )
        }
        "web" {
            return @(
                "@$repoName/web dev",
                "$repoName/web/node_modules/.bin/.*/vite"
            )
        }
        default {
            return @()
        }
    }
}

function Stop-WslWorkspaceComponent($componentName) {
    if (-not (Get-WslCommand)) {
        return
    }
    $patterns = Get-WslPatterns $componentName
    if ($patterns.Count -eq 0) {
        return
    }
    $commands = @($patterns | ForEach-Object { "pkill -f '$_' || true" })
    & wsl.exe -e sh -lc ($commands -join "; ") 2>$null | Out-Null
}

function Test-IsWorkspaceProcess($proc) {
    if (-not $proc -or -not $proc.CommandLine) {
        return $false
    }
    return $proc.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Stop-WorkspaceListener($port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue
        if (Test-IsWorkspaceProcess $proc) {
            taskkill /PID $_.OwningProcess /T /F 2>$null | Out-Null
            Write-Host "Stopped listener on port $port (PID $($_.OwningProcess))"
        }
    }
}

$webPortFile = Join-Path $runDir "web.port"
$recordedWebPort = $null
if (Test-Path $webPortFile) {
    $webPort = (Get-Content -Raw $webPortFile -ErrorAction SilentlyContinue).Trim()
    if ($webPort -match "^\d+$") {
        $recordedWebPort = [int]$webPort
    }
}

Stop-Component "server" $serverMatchToken
Stop-Component "web" $webMatchToken
Stop-WslWorkspaceComponent "server"
Stop-WslWorkspaceComponent "web"

$ports = @($serverPort)
if ($recordedWebPort) {
    $ports += $recordedWebPort
}
else {
    $ports += $defaultWebPort
}

$ports | Select-Object -Unique | ForEach-Object { Stop-WorkspaceListener $_ }

Write-Host "Stopped." -ForegroundColor Cyan

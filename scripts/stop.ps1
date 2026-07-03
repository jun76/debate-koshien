#Requires -Version 5.1
<#
.SYNOPSIS
    Stop the debate app started by scripts/start.ps1.
.DESCRIPTION
    Kills recorded process trees, then frees recorded workspace listeners as a fallback.
#>

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".run"

function Get-ComponentProcess($name, $script) {
    $pidFile = Join-Path $runDir "$name.pid"
    if (Test-Path $pidFile) {
        $procId = (Get-Content -Raw $pidFile -ErrorAction SilentlyContinue).Trim()
        if ($procId -match "^\d+$") {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
            if ($proc -and $proc.CommandLine -like "*pnpm $script*") {
                return $proc
            }
        }
    }
    return $null
}

function Remove-ComponentFiles($name) {
    foreach ($suffix in "pid", "url", "port") {
        Remove-Item (Join-Path $runDir "$name.$suffix") -Force -ErrorAction SilentlyContinue
    }
}

function Stop-Component($name, $script) {
    $proc = Get-ComponentProcess $name $script
    if ($proc) {
        taskkill /PID $proc.ProcessId /T /F 2>$null | Out-Null
        Write-Host "Stopped $name (PID $($proc.ProcessId))"
    }
    Remove-ComponentFiles $name
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
        else {
            Write-Host "Skipped listener on port $port (PID $($_.OwningProcess)); it is not from this workspace." -ForegroundColor Yellow
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

Stop-Component "server" "dev:server"
Stop-Component "web" "dev:web"

# Fallback: free this workspace's listeners in case PIDs drifted.
$ports = @(8787)
if ($recordedWebPort) {
    $ports += $recordedWebPort
}
else {
    $ports += 56173
}

$ports | Select-Object -Unique | ForEach-Object { Stop-WorkspaceListener $_ }

Write-Host "Stopped." -ForegroundColor Cyan

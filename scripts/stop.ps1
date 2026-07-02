#Requires -Version 5.1
<#
.SYNOPSIS
    Stop the debate app started by scripts/start.ps1.
.DESCRIPTION
    Kills the recorded process trees, then frees ports 8787 / 5173 as a fallback.
#>

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".run"

function Stop-Component($name) {
    $pidFile = Join-Path $runDir "$name.pid"
    if (Test-Path $pidFile) {
        $procId = Get-Content $pidFile
        if ($procId) {
            taskkill /PID $procId /T /F 2>$null | Out-Null
            Write-Host "Stopped $name (PID $procId)"
        }
        Remove-Item $pidFile -Force
    }
}

Stop-Component "server"
Stop-Component "web"

# Fallback: free the known ports in case PIDs drifted.
foreach ($port in 8787, 5173) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        taskkill /PID $_.OwningProcess /T /F 2>$null | Out-Null
    }
}

Write-Host "Stopped." -ForegroundColor Cyan

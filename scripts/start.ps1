#Requires -Version 5.1
<#
.SYNOPSIS
    Start the debate app (API server + web UI) in the background.
.DESCRIPTION
    Launches both dev servers detached, writing PIDs and logs under .run/.
    Re-running is safe: components already running are skipped.
    Use scripts/stop.ps1 to stop everything.
.PARAMETER Install
    Force `pnpm install` before starting.
#>
param([switch]$Install)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".run"
New-Item -ItemType Directory -Force $runDir | Out-Null

Push-Location $root
try {
    if ($Install -or -not (Test-Path (Join-Path $root "node_modules"))) {
        Write-Host "Installing dependencies..." -ForegroundColor Cyan
        pnpm install
    }

    function Start-Component($name, $script, $url) {
        $pidFile = Join-Path $runDir "$name.pid"
        if (Test-Path $pidFile) {
            $old = Get-Content $pidFile -ErrorAction SilentlyContinue
            if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
                Write-Host "$name already running (PID $old)" -ForegroundColor Yellow
                return
            }
        }
        $log = Join-Path $runDir "$name.log"
        $cmd = "/c pnpm $script > `"$log`" 2>&1"
        $proc = Start-Process -FilePath "cmd.exe" -ArgumentList $cmd -WindowStyle Hidden -PassThru
        $proc.Id | Set-Content $pidFile
        Write-Host ("Started {0} (PID {1}) -> {2}   log: {3}" -f $name, $proc.Id, $url, $log) -ForegroundColor Green
    }

    Start-Component "server" "dev:server" "http://127.0.0.1:8787"
    Start-Component "web" "dev:web" "http://localhost:5173"

    Write-Host "`nOpen http://localhost:5173 in your browser. Run scripts/stop.ps1 to stop." -ForegroundColor Cyan
}
finally {
    Pop-Location
}

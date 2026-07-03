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

    function Get-ComponentProcess($name, $script) {
        $pidFile = Join-Path $runDir "$name.pid"
        if (Test-Path $pidFile) {
            $old = (Get-Content -Raw $pidFile -ErrorAction SilentlyContinue).Trim()
            if ($old -match "^\d+$") {
                $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$old" -ErrorAction SilentlyContinue
                if ($proc -and $proc.CommandLine -like "*pnpm $script*") {
                    return $proc
                }
                if ($proc) {
                    Write-Host "Ignoring stale $name PID $old (process is not this app)." -ForegroundColor Yellow
                }
            }
            Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        }
        return $null
    }

    function Get-ComponentUrl($name, $fallbackUrl) {
        $urlFile = Join-Path $runDir "$name.url"
        if (Test-Path $urlFile) {
            $stored = (Get-Content -Raw $urlFile -ErrorAction SilentlyContinue).Trim()
            if ($stored) {
                return $stored
            }
        }
        return $fallbackUrl
    }

    function Test-TcpPortAvailable($port) {
        $listener = $null
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
            $listener.Start()
            return $true
        }
        catch {
            return $false
        }
        finally {
            if ($listener) {
                $listener.Stop()
            }
        }
    }

    function Get-FreeTcpPort($preferredPort) {
        for ($port = $preferredPort; $port -lt ($preferredPort + 100); $port++) {
            if (Test-TcpPortAvailable $port) {
                return $port
            }
        }
        throw "No available TCP port found from $preferredPort to $($preferredPort + 99)."
    }

    function Start-Component($name, $script, $url, $environment = @{}, $port = $null) {
        $oldProc = Get-ComponentProcess $name $script
        if ($oldProc) {
            $currentUrl = Get-ComponentUrl $name $url
            Write-Host ("{0} already running (PID {1}) -> {2}" -f $name, $oldProc.ProcessId, $currentUrl) -ForegroundColor Yellow
            return [pscustomobject]@{ Url = $currentUrl; Started = $false; Pid = $oldProc.ProcessId }
        }

        $pidFile = Join-Path $runDir "$name.pid"
        $urlFile = Join-Path $runDir "$name.url"
        $portFile = Join-Path $runDir "$name.port"
        $log = Join-Path $runDir "$name.log"
        $commands = @()
        foreach ($key in ($environment.Keys | Sort-Object)) {
            $commands += ('set "{0}={1}"' -f $key, $environment[$key])
        }
        $commands += "pnpm $script"
        $cmd = "/c " + (($commands -join " && ") + " > `"$log`" 2>&1")
        $proc = Start-Process -FilePath "cmd.exe" -ArgumentList $cmd -WindowStyle Hidden -PassThru
        $proc.Id | Set-Content $pidFile
        $url | Set-Content $urlFile
        if ($null -ne $port) {
            $port | Set-Content $portFile
        }
        else {
            Remove-Item $portFile -Force -ErrorAction SilentlyContinue
        }
        Write-Host ("Started {0} (PID {1}) -> {2}   log: {3}" -f $name, $proc.Id, $url, $log) -ForegroundColor Green
        return [pscustomobject]@{ Url = $url; Started = $true; Pid = $proc.Id }
    }

    $server = Start-Component "server" "dev:server" "http://127.0.0.1:8787" @{} 8787

    $webExisting = Get-ComponentProcess "web" "dev:web"
    if ($webExisting) {
        $web = Start-Component "web" "dev:web" (Get-ComponentUrl "web" "http://localhost:56173")
    }
    else {
        $preferredWebPort = 56173
        $webPort = Get-FreeTcpPort $preferredWebPort
        if ($webPort -ne $preferredWebPort) {
            Write-Host ("Port {0} is unavailable; using {1} for web." -f $preferredWebPort, $webPort) -ForegroundColor Yellow
        }
        $webUrl = "http://localhost:$webPort"
        $web = Start-Component "web" "dev:web" $webUrl @{ PORT = $webPort } $webPort
    }

    Write-Host ("`nOpen {0} in your browser. Run scripts/stop.ps1 to stop." -f $web.Url) -ForegroundColor Cyan
}
finally {
    Pop-Location
}

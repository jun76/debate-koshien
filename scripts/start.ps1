#Requires -Version 5.1
<#
.SYNOPSIS
    Start the AI Debate Koshien app (API server + web UI) in the background.
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
    function Test-TcpPortListening($port, $hostname = "127.0.0.1") {
        $client = $null
        $async = $null
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $async = $client.BeginConnect($hostname, $port, $null, $null)
            if (-not $async.AsyncWaitHandle.WaitOne(250)) {
                return $false
            }
            $client.EndConnect($async)
            return $true
        }
        catch {
            return $false
        }
        finally {
            if ($async) {
                $async.AsyncWaitHandle.Dispose()
            }
            if ($client) {
                $client.Dispose()
            }
        }
    }

    function Ensure-DependenciesInstalled() {
        $requiredPaths = @(
            (Join-Path $root "node_modules"),
            (Join-Path $root "server\node_modules\tsx\dist\cli.mjs"),
            (Join-Path $root "web\node_modules\vite\bin\vite.js")
        )
        $missingPath = $requiredPaths | Where-Object { -not (Test-Path $_) } | Select-Object -First 1
        if ($Install) {
            Write-Host "Installing dependencies..." -ForegroundColor Cyan
            pnpm install
        }
        elseif ($missingPath) {
            $nodeModulesPresent = Test-Path (Join-Path $root "node_modules")
            $packageNodeModulesPresent = (Test-Path (Join-Path $root "server\node_modules")) -or (Test-Path (Join-Path $root "web\node_modules"))
            if ($nodeModulesPresent -or $packageNodeModulesPresent) {
                Write-Host "Repairing broken dependencies..." -ForegroundColor Cyan
                pnpm install --force
            }
            else {
                Write-Host "Installing dependencies..." -ForegroundColor Cyan
                pnpm install
            }
        }

        $stillMissing = $requiredPaths | Where-Object { -not (Test-Path $_) } | Select-Object -First 1
        if ($stillMissing) {
            throw "Dependencies are not usable after install: $stillMissing"
        }
    }

    function Get-LogExcerpt($logPath, $lineCount = 20) {
        if (-not (Test-Path $logPath)) {
            return "(log file not created yet)"
        }
        return ((Get-Content $logPath -Tail $lineCount -ErrorAction SilentlyContinue) -join [Environment]::NewLine)
    }

    function Wait-ComponentReady($name, $processId, $port, $logPath, $timeoutSeconds = 15, $hostname = "127.0.0.1") {
        $deadline = (Get-Date).AddSeconds($timeoutSeconds)
        while ((Get-Date) -lt $deadline) {
            $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $proc) {
                $excerpt = Get-LogExcerpt $logPath
                throw "$name failed to start. Last log lines:`n$excerpt"
            }
            if (Test-TcpPortListening $port $hostname) {
                return
            }
            Start-Sleep -Milliseconds 250
        }
        $excerpt = Get-LogExcerpt $logPath
        throw "$name did not become ready on ${hostname}:$port within $timeoutSeconds seconds. Last log lines:`n$excerpt"
    }

    Ensure-DependenciesInstalled

    function Get-ComponentProcess($name, $script, $port = $null, $hostname = "127.0.0.1") {
        $pidFile = Join-Path $runDir "$name.pid"
        if (Test-Path $pidFile) {
            $old = (Get-Content -Raw $pidFile -ErrorAction SilentlyContinue).Trim()
            if ($old -match "^\d+$") {
                $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$old" -ErrorAction SilentlyContinue
                if ($proc -and $proc.CommandLine -like "*pnpm $script*") {
                    if ($null -eq $port -or (Test-TcpPortListening $port $hostname)) {
                        return $proc
                    }
                    Write-Host "Ignoring stale $name PID $old (process is not accepting connections on ${hostname}:$port)." -ForegroundColor Yellow
                }
                elseif ($proc) {
                    Write-Host "Ignoring stale $name PID $old (process is not this app)." -ForegroundColor Yellow
                }
            }
            Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        }
        return $null
    }

    if ($false) {
        Write-Host "Installing dependencies..." -ForegroundColor Cyan
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

    function Start-Component($name, $script, $url, $environment = @{}, $port = $null, $hostname = "127.0.0.1") {
        $pidFile = Join-Path $runDir "$name.pid"
        $urlFile = Join-Path $runDir "$name.url"
        $portFile = Join-Path $runDir "$name.port"
        $log = Join-Path $runDir "$name.log"
        $oldProc = Get-ComponentProcess $name $script $port $hostname
        if ($oldProc) {
            $url | Set-Content $urlFile
            Write-Host ("{0} already running (PID {1}) -> {2}" -f $name, $oldProc.ProcessId, $url) -ForegroundColor Yellow
            return [pscustomobject]@{ Url = $url; Started = $false; Pid = $oldProc.ProcessId; Log = $log }
        }

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
        return [pscustomobject]@{ Url = $url; Started = $true; Pid = $proc.Id; Log = $log }
    }

    $server = Start-Component "server" "dev:server" "http://127.0.0.1:8787" @{} 8787 "127.0.0.1"
    Wait-ComponentReady "server" $server.Pid 8787 $server.Log 15 "127.0.0.1"

    $existingWebPort = if (Test-Path (Join-Path $runDir "web.port")) { [int](Get-Content -Raw (Join-Path $runDir "web.port")) } else { 56173 }
    $webExisting = Get-ComponentProcess "web" "dev:web" $existingWebPort "localhost"
    if ($webExisting) {
        $web = Start-Component "web" "dev:web" "http://localhost:$existingWebPort" @{ PORT = $existingWebPort } $existingWebPort "localhost"
    }
    else {
        $preferredWebPort = 56173
        $webPort = Get-FreeTcpPort $preferredWebPort
        if ($webPort -ne $preferredWebPort) {
            Write-Host ("Port {0} is unavailable; using {1} for web." -f $preferredWebPort, $webPort) -ForegroundColor Yellow
        }
        $webUrl = "http://localhost:$webPort"
        $web = Start-Component "web" "dev:web" $webUrl @{ PORT = $webPort } $webPort "localhost"
    }
    $webPortToCheck = if (Test-Path (Join-Path $runDir "web.port")) { [int](Get-Content -Raw (Join-Path $runDir "web.port")) } else { 56173 }
    Wait-ComponentReady "web" $web.Pid $webPortToCheck $web.Log 15 "localhost"

    Write-Host ("`nOpen {0} in your browser. Run scripts/stop.ps1 to stop." -f $web.Url) -ForegroundColor Cyan
}
finally {
    Pop-Location
}

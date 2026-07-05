#Requires -Version 5.1
<#
.SYNOPSIS
    Start the AI Debate Koshien app (API server + web UI) in the background.
.DESCRIPTION
    Launches both servers detached, writing PIDs and logs under .run/.
    Re-running is safe: components already running are skipped.
    Use scripts/stop.ps1 to stop everything.
.PARAMETER Install
    Force `pnpm install` before starting.
#>
param([switch]$Install)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".run"
$repoName = Split-Path $root -Leaf
New-Item -ItemType Directory -Force $runDir | Out-Null
. (Join-Path $PSScriptRoot "runtime.ps1")

$dependencyPaths = @($RunSettings.DependencyPaths | ForEach-Object { Join-Path $root $_ })
$serverComponent = [pscustomobject]@{
    Name            = $RunSettings.Server.Name
    Host            = $RunSettings.Server.Host
    PreferredPort   = [int]$RunSettings.Server.Port
    MatchToken      = $RunSettings.Server.MatchToken
    StartArgs       = @($RunSettings.Server.StartArgs)
    Env             = @{}
    DirectPnpm      = [bool]$RunSettings.Server.DirectPnpm
    PortSearchLimit = [int]$RunSettings.Server.PortSearchLimit
}

$webComponent = [pscustomobject]@{
    Name            = $RunSettings.Web.Name
    Host            = $RunSettings.Web.Host
    PreferredPort   = [int]$RunSettings.Web.Port
    MatchToken      = $RunSettings.Web.MatchToken
    StartArgs       = @($RunSettings.Web.StartArgs)
    Env             = @{}
    DirectPnpm      = [bool]$RunSettings.Web.DirectPnpm
    PortSearchLimit = [int]$RunSettings.Web.PortSearchLimit
}

Push-Location $root
try {
    function Test-TcpPortListening($port, $hostname) {
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
            if ($async) { $async.AsyncWaitHandle.Dispose() }
            if ($client) { $client.Dispose() }
        }
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
            if ($listener) { $listener.Stop() }
        }
    }

    function Get-FreeTcpPort($preferredPort, $searchLimit) {
        for ($port = $preferredPort; $port -lt ($preferredPort + $searchLimit); $port++) {
            if (Test-TcpPortAvailable $port) {
                return $port
            }
        }
        throw "No available TCP port found from $preferredPort to $($preferredPort + $searchLimit - 1)."
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

    function Test-WslPortListening($port) {
        if (-not (Get-WslCommand)) {
            return $false
        }
        $output = & wsl.exe -e sh -lc "ss -ltnp 2>/dev/null | grep ':$port ' || true" 2>$null
        return -not [string]::IsNullOrWhiteSpace(($output -join "`n"))
    }

    function Test-IsWorkspaceProcess($proc) {
        if (-not $proc -or -not $proc.CommandLine) {
            return $false
        }
        return $proc.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }

    function Get-ListeningProcess($port) {
        $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $conn) {
            return $null
        }
        return Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
    }

    function Stop-WorkspaceListener($port) {
        $proc = Get-ListeningProcess $port
        if (-not (Test-IsWorkspaceProcess $proc)) {
            return $false
        }
        taskkill /PID $proc.ProcessId /T /F 2>$null | Out-Null
        return $true
    }

    function Ensure-PortFreeForStart($component, $port) {
        if (-not (Test-TcpPortListening $port $component.Host)) {
            return
        }

        if (Stop-WorkspaceListener $port) {
            Start-Sleep -Milliseconds 500
            if (-not (Test-TcpPortListening $port $component.Host)) {
                return
            }
        }

        if (Test-WslPortListening $port) {
            Write-Host ("Port {0} is occupied by a WSL process; stopping the {1} workspace process there." -f $port, $component.Name) -ForegroundColor Yellow
            Stop-WslWorkspaceComponent $component.Name
            Start-Sleep -Milliseconds 500
            if (-not (Test-TcpPortListening $port $component.Host)) {
                return
            }
        }

        $proc = Get-ListeningProcess $port
        if ($proc) {
            throw ("{0} cannot start because {1}:{2} is already used by PID {3}: {4}" -f $component.Name, $component.Host, $port, $proc.ProcessId, $proc.CommandLine)
        }

        throw ("{0} cannot start because {1}:{2} is already in use by another process." -f $component.Name, $component.Host, $port)
    }

    function Ensure-DependenciesInstalled() {
        $missingPath = $dependencyPaths | Where-Object { -not (Test-Path $_) } | Select-Object -First 1
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

        $stillMissing = $dependencyPaths | Where-Object { -not (Test-Path $_) } | Select-Object -First 1
        if ($stillMissing) {
            throw "Dependencies are not usable after install: $stillMissing"
        }
    }

    function Get-LogExcerpt($paths, $lineCount = 20) {
        $existing = @($paths | Where-Object { $_ -and (Test-Path $_) })
        if ($existing.Count -eq 0) {
            return "(log file not created yet)"
        }

        return (($existing | ForEach-Object {
                    $name = Split-Path $_ -Leaf
                    $content = (Get-Content $_ -Tail $lineCount -ErrorAction SilentlyContinue) -join [Environment]::NewLine
                    "[$name]`n$content"
                }) -join [Environment]::NewLine)
    }

    function Get-ComponentProcess($component, $port) {
        $pidFile = Join-Path $runDir "$($component.Name).pid"
        if (-not (Test-Path $pidFile)) {
            return $null
        }

        $old = (Get-Content -Raw $pidFile -ErrorAction SilentlyContinue).Trim()
        if ($old -notmatch "^\d+$") {
            Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
            return $null
        }

        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$old" -ErrorAction SilentlyContinue
        if ($proc -and $proc.CommandLine -like "*pnpm*$($component.MatchToken)*") {
            if ($null -eq $port -or (Test-TcpPortListening $port $component.Host)) {
                return $proc
            }
            Write-Host "Ignoring stale $($component.Name) PID $old (process is not accepting connections on $($component.Host):$port)." -ForegroundColor Yellow
        }
        elseif ($proc) {
            Write-Host "Ignoring stale $($component.Name) PID $old (process is not this app)." -ForegroundColor Yellow
        }

        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    function Start-Component($component, $port, $url) {
        $pidFile = Join-Path $runDir "$($component.Name).pid"
        $urlFile = Join-Path $runDir "$($component.Name).url"
        $portFile = Join-Path $runDir "$($component.Name).port"
        $stdoutLog = Join-Path $runDir "$($component.Name).stdout.log"
        $stderrLog = Join-Path $runDir "$($component.Name).stderr.log"
        $combinedLog = Join-Path $runDir "$($component.Name).log"

        $oldProc = Get-ComponentProcess $component $port
        if ($oldProc) {
            $url | Set-Content $urlFile
            Write-Host ("{0} already running (PID {1}) -> {2}" -f $component.Name, $oldProc.ProcessId, $url) -ForegroundColor Yellow
            return [pscustomobject]@{ Url = $url; Started = $false; Pid = $oldProc.ProcessId; LogPaths = @($stderrLog, $stdoutLog, $combinedLog) }
        }

        Remove-Item $stdoutLog, $stderrLog, $combinedLog -Force -ErrorAction SilentlyContinue
        if ($component.DirectPnpm -and ($component.Env.Keys | Measure-Object).Count -eq 0) {
            $proc = Start-Process -FilePath "pnpm.cmd" -ArgumentList $component.StartArgs -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden -PassThru
            $logPaths = @($stderrLog, $stdoutLog)
        }
        else {
            $commands = @()
            foreach ($key in ($component.Env.Keys | Sort-Object)) {
                $commands += ('set "{0}={1}"' -f $key, $component.Env[$key])
            }
            $commands += ("pnpm " + ($component.StartArgs -join " "))
            $cmd = "/c " + (($commands -join " && ") + " > `"$combinedLog`" 2>&1")
            $proc = Start-Process -FilePath "cmd.exe" -ArgumentList $cmd -WindowStyle Hidden -PassThru
            $logPaths = @($combinedLog)
        }

        $proc.Id | Set-Content $pidFile
        $url | Set-Content $urlFile
        $port | Set-Content $portFile
        Write-Host ("Started {0} (PID {1}) -> {2}   logs: {3}" -f $component.Name, $proc.Id, $url, ($logPaths -join ", ")) -ForegroundColor Green
        return [pscustomobject]@{ Url = $url; Started = $true; Pid = $proc.Id; LogPaths = $logPaths }
    }

    function Wait-ComponentReady($component, $processId, $port, $logPaths, $timeoutSeconds = 15) {
        $deadline = (Get-Date).AddSeconds($timeoutSeconds)
        while ((Get-Date) -lt $deadline) {
            $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $proc) {
                $excerpt = Get-LogExcerpt $logPaths
                throw "$($component.Name) failed to start. Last log lines:`n$excerpt"
            }
            if (Test-TcpPortListening $port $component.Host) {
                return
            }
            Start-Sleep -Milliseconds 250
        }
        $excerpt = Get-LogExcerpt $logPaths
        throw "$($component.Name) did not become ready on $($component.Host):$port within $timeoutSeconds seconds. Last log lines:`n$excerpt"
    }

    Ensure-DependenciesInstalled

    $serverPort = $serverComponent.PreferredPort
    Ensure-PortFreeForStart $serverComponent $serverPort
    $serverResult = Start-Component $serverComponent $serverPort ("http://{0}:{1}" -f $serverComponent.Host, $serverPort)
    Wait-ComponentReady $serverComponent $serverResult.Pid $serverPort $serverResult.LogPaths 15

    $existingWebPort = if (Test-Path (Join-Path $runDir "web.port")) { [int](Get-Content -Raw (Join-Path $runDir "web.port")) } else { $webComponent.PreferredPort }
    $webExisting = Get-ComponentProcess $webComponent $existingWebPort
    if ($webExisting) {
        $webResult = Start-Component $webComponent $existingWebPort ("http://{0}:{1}" -f $webComponent.Host, $existingWebPort)
    }
    else {
        $webPort = Get-FreeTcpPort $webComponent.PreferredPort $webComponent.PortSearchLimit
        if ($webPort -ne $webComponent.PreferredPort) {
            Write-Host ("Port {0} is unavailable; using {1} for web." -f $webComponent.PreferredPort, $webPort) -ForegroundColor Yellow
        }
        $webComponent.Env = @{ PORT = $webPort }
        $webResult = Start-Component $webComponent $webPort ("http://{0}:{1}" -f $webComponent.Host, $webPort)
    }
    $webPortToCheck = if (Test-Path (Join-Path $runDir "web.port")) { [int](Get-Content -Raw (Join-Path $runDir "web.port")) } else { $webComponent.PreferredPort }
    Wait-ComponentReady $webComponent $webResult.Pid $webPortToCheck $webResult.LogPaths 15

    Write-Host ("`nOpen {0} in your browser. Run scripts/stop.ps1 to stop." -f $webResult.Url) -ForegroundColor Cyan
}
finally {
    Pop-Location
}

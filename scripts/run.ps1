# Windows PowerShell 5.1 / PowerShell 7 entry point. No npm dependencies.
# Keep converter arguments in $args so unknown CLI flags pass through unchanged.
$ErrorActionPreference = 'Stop'
$cliArguments = @($args)
$entry = 'wechat-to-md.cjs'
if ($cliArguments.Count -gt 0) {
    $entries = @{ '--batch'='batch.cjs'; '--discover'='discover.cjs'; '--free-discover'='free-discover.cjs'; '--archive'='archive.cjs'; '--classify'='classify.cjs' }
    if ($entries.ContainsKey($cliArguments[0])) {
        $entry = $entries[$cliArguments[0]]
        $cliArguments = @($cliArguments | Select-Object -Skip 1)
    }
}
$converter = Join-Path $PSScriptRoot $entry

function Test-UsableNode([string] $Executable) {
    try {
        & $Executable -e 'process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)' *> $null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

$nodePath = $null
$stage = $null
$lock = $null
$ownsLock = $false
$oldTls = [Net.ServicePointManager]::SecurityProtocol
try {
    $existing = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existing -and (Test-UsableNode $existing.Source)) {
        $nodePath = $existing.Source
    } else {
        if ($env:OS -ne 'Windows_NT') { throw 'This entry point supports Windows. Use scripts/run.sh on macOS / Linux.' }
        try { $machineArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() }
        catch {
            $machineArchitecture = $env:PROCESSOR_ARCHITEW6432
            if (-not $machineArchitecture) { $machineArchitecture = $env:PROCESSOR_ARCHITECTURE }
        }
        switch ($machineArchitecture.ToLowerInvariant()) {
            { $_ -in @('x64', 'amd64') } { $architecture = 'x64'; break }
            'arm64' { $architecture = 'arm64'; break }
            default { throw "No configured official binary for architecture: $machineArchitecture" }
        }
        $localData = [Environment]::GetFolderPath('LocalApplicationData')
        if (-not $localData) { throw 'Cannot locate the current user LocalApplicationData directory.' }
        $runtimeRoot = Join-Path $localData 'WechatArticleToMd\node'
        $runtime = Join-Path $runtimeRoot "runtime-win-$architecture"
        $privateNode = Join-Path $runtime 'node.exe'
        if (Test-Path -LiteralPath $runtime) {
            if (-not (Test-UsableNode $privateNode)) { throw "Private runtime is unusable: $runtime. Check OS compatibility or retire this directory as described in the tutorial." }
            $nodePath = $privateNode
        } else {
            [void][IO.Directory]::CreateDirectory($runtimeRoot)
            $lock = Join-Path $runtimeRoot '.install-lock'
            try { [void](New-Item -ItemType Directory -Path $lock -ErrorAction Stop) }
            catch { throw "Another installation is running, or a previous interrupted run left a lock: $lock. Check for an active installation before removing it." }
            $ownsLock = $true
            $stage = Join-Path $runtimeRoot ('.install.' + [Guid]::NewGuid().ToString('N'))
            [void][IO.Directory]::CreateDirectory($stage)
            Write-Host "No usable Node.js 18+ found. Downloading Node.js 24.x LTS (Windows / $architecture) and its SHA256 manifest from nodejs.org." -ForegroundColor Cyan
            Write-Host "User-only destination: $runtime. No administrator access, global PATH edits, or existing Node.js replacement."
            # TLS verification remains enabled; reject redirects, including cross-host ones.
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $manifestPath = Join-Path $stage 'SHASUMS256.txt'
            Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -OutFile $manifestPath -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 300
            $pattern = '^([0-9a-f]{64})\s+(node-v24\.[0-9]+\.[0-9]+-win-' + $architecture + '\.zip)$'
            $selections = @(foreach ($line in Get-Content -LiteralPath $manifestPath) {
                if ($line -cmatch $pattern) { [PSCustomObject]@{ Hash = $Matches[1]; File = $Matches[2] } }
            })
            if ($selections.Count -ne 1) { throw "The official manifest has no unique Windows / $architecture binary. No alternative platform will be used." }
            $selection = $selections[0]
            $archiveName = $selection.File
            if ($archiveName -cnotmatch '^node-(v24\.[0-9]+\.[0-9]+)-') { throw 'Invalid official archive filename.' }
            $version = $Matches[1]
            $archivePath = Join-Path $stage $archiveName
            Write-Host "Downloading official archive: $archiveName"
            Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/$archiveName" -OutFile $archivePath -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 300
            $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
            if ($actualHash.ToLowerInvariant() -cne $selection.Hash) { throw 'SHA256 mismatch. The downloaded archive will not be extracted or executed.' }
            Expand-Archive -LiteralPath $archivePath -DestinationPath $stage
            $unpacked = Join-Path $stage ($archiveName -replace '\.zip$', '')
            $candidateNode = Join-Path $unpacked 'node.exe'
            if (-not (Test-UsableNode $candidateNode)) { throw 'The verified official Node.js cannot run on this system. Check OS compatibility.' }
            if (Test-Path -LiteralPath $runtime) { throw "Destination appeared during installation; refusing to overwrite: $runtime" }
            Move-Item -LiteralPath $unpacked -Destination $runtime
            $nodePath = $privateNode
            Write-Host "Verified and installed Node.js $version at $runtime"
        }
    }
} catch {
    [Console]::Error.WriteLine("Environment setup failed: " + $_.Exception.Message)
    [Console]::Error.WriteLine("Check network, proxy and trusted system CA certificates. Do not disable HTTPS verification. See $PSScriptRoot\..\references\environment.md, or install Node.js 18+ from https://nodejs.org/en/download and retry.")
    exit 1
} finally {
    [Net.ServicePointManager]::SecurityProtocol = $oldTls
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
    if ($ownsLock -and (Test-Path -LiteralPath $lock)) { Remove-Item -LiteralPath $lock }
}

& $nodePath $converter @cliArguments
exit $LASTEXITCODE

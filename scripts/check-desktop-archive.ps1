$ErrorActionPreference = 'Stop'
$taskRoot = (Get-Location).Path
$taskMetadata = Get-Content -Raw (Join-Path $taskRoot 'artifacts/desktop-archive.json') | ConvertFrom-Json
$taskArchivePath = (Resolve-Path -LiteralPath $taskMetadata.archive).Path
$taskReleaseRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot 'release')) + [IO.Path]::DirectorySeparatorChar
if (-not $taskArchivePath.StartsWith($taskReleaseRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive must be inside this workspace release directory.' }
if ((Get-FileHash -LiteralPath $taskArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskMetadata.sha256) { throw 'ZIP checksum mismatch.' }
if ((Get-Item -LiteralPath $taskArchivePath).Length -ne $taskMetadata.bytes) { throw 'ZIP size mismatch.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [IO.Compression.ZipFile]::OpenRead($taskArchivePath)
try {
    $taskRequired = @('TIDEHOLD.exe', 'resources/app.asar', 'ASSET_LICENSES.md', 'licenses/THREE-LICENSE.txt', 'LICENSES.chromium.html', '시작하기.txt')
    $taskRequiredNames = @($taskRequired | ForEach-Object { 'TIDEHOLD-win32-x64/' + $_ })
    foreach ($taskEntryName in $taskRequiredNames) {
        $taskEntry = $taskZip.GetEntry($taskEntryName)
        if ($null -eq $taskEntry -or $taskEntry.Length -eq 0) { throw "Missing required ZIP entry: $taskEntryName" }
    }
    $taskExcluded = @($taskZip.Entries | Where-Object { $_.FullName -match '(^|/)(artifacts|tests|test-results|desktop-profiles|browser-profile|\.git)(/|$)' })
    if ($taskExcluded.Count -gt 0) { throw 'ZIP contains development or profile folders.' }
    $taskHashes = @{}
    foreach ($taskName in @('TIDEHOLD.exe', 'resources/app.asar')) {
        $taskStream = $taskZip.GetEntry('TIDEHOLD-win32-x64/' + $taskName).Open()
        $taskHasher = [Security.Cryptography.SHA256]::Create()
        try { $taskHashes[$taskName] = [Convert]::ToHexString($taskHasher.ComputeHash($taskStream)).ToLowerInvariant() }
        finally { $taskHasher.Dispose(); $taskStream.Dispose() }
    }
    if ($taskHashes['TIDEHOLD.exe'] -ne $taskMetadata.executableSha256 -or $taskHashes['resources/app.asar'] -ne $taskMetadata.asarSha256) { throw 'Embedded executable or ASAR checksum mismatch.' }
    $taskReport = [ordered]@{
        date = [DateTime]::UtcNow.ToString('o'); archive = $taskArchivePath; bytes = $taskMetadata.bytes; sha256 = $taskMetadata.sha256
        entries = $taskZip.Entries.Count; requiredEntries = $taskRequiredNames; requiredCount = $taskRequiredNames.Count
        executableSha256 = $taskHashes['TIDEHOLD.exe']; asarSha256 = $taskHashes['resources/app.asar']; excludedProfileEntries = $taskExcluded.Count; allMatch = $true
    }
    $taskReport | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $taskRoot 'artifacts/network-zip-integrity.json') -Encoding utf8
    [pscustomobject]@{allMatch=$true; entries=$taskZip.Entries.Count; requiredCount=$taskRequiredNames.Count; excludedProfileEntries=0} | ConvertTo-Json
} finally { $taskZip.Dispose() }

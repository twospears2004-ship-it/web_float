$ErrorActionPreference = 'Stop'
$taskRoot = (Get-Location).Path
$taskPackage = Get-Content -Raw (Join-Path $taskRoot 'artifacts/desktop-package.json') | ConvertFrom-Json
$taskDirectory = (Resolve-Path -LiteralPath $taskPackage.directory).Path
$taskReleaseRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot 'release')) + [IO.Path]::DirectorySeparatorChar
if (-not $taskDirectory.StartsWith($taskReleaseRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Package must be inside this workspace release directory.' }
$taskExecutable = (Resolve-Path -LiteralPath $taskPackage.executable).Path
if (-not $taskExecutable.StartsWith($taskDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Executable must belong to this package.' }
if ((Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPackage.sha256) { throw 'Executable checksum mismatch.' }
$taskAsar = Join-Path $taskDirectory 'resources/app.asar'
if ((Get-FileHash -LiteralPath $taskAsar -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPackage.asarSha256) { throw 'ASAR checksum mismatch.' }
$taskArchive = Join-Path (Split-Path -Parent $taskDirectory) ('TIDEHOLD-' + $taskPackage.version + '-win32-x64.zip')
if (Test-Path -LiteralPath $taskArchive) { throw 'Archive already exists; preserve existing release evidence.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($taskDirectory, $taskArchive, [IO.Compression.CompressionLevel]::Optimal, $true)
$taskReport = [ordered]@{
    date = [DateTime]::UtcNow.ToString('o'); archive = $taskArchive
    bytes = (Get-Item -LiteralPath $taskArchive).Length
    sha256 = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    executable = $taskExecutable; executableSha256 = $taskPackage.sha256; asarSha256 = $taskPackage.asarSha256
}
$taskReport | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'artifacts/desktop-archive.json') -Encoding utf8
$taskReport | ConvertTo-Json

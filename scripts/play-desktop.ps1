param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
try {
    $taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $taskMetadata = Join-Path $taskRoot 'artifacts/desktop-package.json'
    if (-not (Test-Path -LiteralPath $taskMetadata)) { throw 'No Windows package found. Use Play-Tidehold.cmd for the browser game, or build the desktop package.' }
    $taskPackage = Get-Content -Raw -Encoding UTF8 -LiteralPath $taskMetadata | ConvertFrom-Json
    $taskExecutable = (Resolve-Path -LiteralPath $taskPackage.executable).Path
    $taskReleaseRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot 'release')) + [IO.Path]::DirectorySeparatorChar
    if (-not $taskExecutable.StartsWith($taskReleaseRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($taskExecutable) -ne 'TIDEHOLD.exe') { throw 'Package entry must be a TIDEHOLD.exe inside this workspace release directory.' }
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    $taskStream = [IO.File]::OpenRead($taskExecutable)
    try {
        $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $taskStream.Dispose()
        $taskHasher.Dispose()
    }
    if ($taskHash -ne $taskPackage.sha256) { throw 'The executable differs from the recorded package. Check the release before launching.' }
    if ($ValidateOnly) { Write-Output $taskExecutable }
    else { Start-Process -FilePath $taskExecutable -WorkingDirectory (Split-Path -Parent $taskExecutable) }
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
